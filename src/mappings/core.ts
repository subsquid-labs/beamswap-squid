import { SubstrateBlock } from '@subsquid/substrate-processor'
import { ADDRESS_ZERO, ZERO_BD } from '../consts'
import { Transaction, Mint, Burn, Swap } from '../model'
import { getEthPriceInUSD, findEthPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD } from './pricing'
import * as pairAbi from '../types/abi/pair'
import { BigNumber } from 'ethers'
import { convertTokenToDecimal, createLiquidityPosition } from './helpers'
import assert from 'assert'
import { getAddress } from 'ethers/lib/utils'
import { BatchContext, EvmLogEvent } from '@subsquid/substrate-processor'
import { Store } from '@subsquid/typeorm-store'
import { pairContracts } from '../contract'
import {
    getUser,
    getPosition,
    getPair,
    addPosition,
    getBundle,
    getUniswap,
    getTransaction,
    getMint,
    getBurn,
    addTransaction,
    addSwap,
    addMint,
    addBurn,
    getToken,
} from './entityUtils'
import { addTimeout } from '@subsquid/util-timeout'
import bigDecimal from 'js-big-decimal'

async function isMintComplete(store: Store, mintId: string): Promise<boolean> {
    return (await getMint(store, mintId))?.sender != null // sufficient checks
}

const transferEventAbi = pairAbi.events['Transfer(address,address,uint256)']

export async function handleTransfer(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = getAddress(event.args.address)

    const data = transferEventAbi.decode(event.args)
    // ignore initial transfers for first adds
    if (data.to === ADDRESS_ZERO && data.value === BigNumber.from(80)) {
        return
    }

    const transactionHash = event.evmTxHash

    // user stats
    const from = await getUser(ctx.store, data.from)
    const to = await getUser(ctx.store, data.to)

    // get pair and load contract
    const pair = await getPair(ctx.store, contractAddress)

    // liquidity token amount being transfered
    const value = convertTokenToDecimal(data.value.toBigInt(), 18)

    // get or create transaction
    let transaction = await getTransaction(ctx.store, event.evmTxHash)
    if (transaction == null) {
        transaction = new Transaction({
            id: transactionHash,
            blockNumber: block.height,
            timestamp: new Date(block.timestamp),
            mints: [],
            burns: [],
            swaps: [],
        })
        addTransaction(transaction)
    }

    // mints
    if (from.id === ADDRESS_ZERO) {
        const mintsLength = transaction.mints.length
        // update total supply
        pair.totalSupply = pair.totalSupply.add(value)

        // create new mint if no mints so far or if last one is done already
        const isLastComplete =
            mintsLength > 0 ? await isMintComplete(ctx.store, transaction.mints[mintsLength - 1]) : false
        if (mintsLength === 0 || isLastComplete) {
            const mint = new Mint({
                id: `${event.evmTxHash}-${mintsLength}`,
                transaction,
                pair,
                to: to.id,
                liquidity: value,
                timestamp: transaction.timestamp,
            })
            addMint(mint)

            // update mints in transaction
            transaction.mints.push(mint.id)
        }
    }

    // case where direct send first on ETH withdrawls
    if (to.id === pair.id) {
        const burnsLength = transaction.burns.length

        const burn = new Burn({
            id: `${event.evmTxHash}-${burnsLength}`,
            transaction,
            pair,
            liquidity: value,
            timestamp: transaction.timestamp,
            to: to.id,
            sender: from.id,
            needsComplete: true,
        })

        addBurn(burn)

        // TODO: Consider using .concat() for handling array updates to protect
        // against unintended side effects for other code paths.
        transaction.burns.push(burn.id)
    }

    // burn
    if (to.id == ADDRESS_ZERO && from.id == pair.id) {
        pair.totalSupply = pair.totalSupply.subtract(value)

        // this is a new instance of a logical burn
        const burnsLength = transaction.burns.length

        const currentBurn = await getBurn(ctx.store, transaction.burns[burnsLength - 1])

        const burn = currentBurn?.needsComplete
            ? currentBurn
            : new Burn({
                  id: `${event.evmTxHash}-${burnsLength}`,
                  transaction,
                  pair,
                  needsComplete: false,
                  liquidity: value,
                  timestamp: transaction.timestamp,
              })

        const mintsLength = transaction.mints.length
        const isLastComplete =
            mintsLength > 0 ? await isMintComplete(ctx.store, transaction.mints[mintsLength - 1]) : true
        // if this logical burn included a fee mint, account for this
        if (!isLastComplete) {
            const mint = await getMint(ctx.store, transaction.mints[mintsLength - 1])
            assert(mint != null)

            burn.feeTo = mint.to
            burn.feeLiquidity = mint.liquidity
            // remove the logical mint
            // await ctx.store.remove(mint)
            // update the transaction

            // TODO: Consider using .slice().pop() to protect against unintended
            // side effects for other code paths.
            transaction.mints.pop()
        }
        addBurn(burn)

        // if accessing last one, replace it
        if (burn.needsComplete) transaction.burns.pop()

        transaction.burns.push(burn.id)
    }

    if (from.id !== ADDRESS_ZERO && from.id !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: from.id })
    }

    if (to.id !== ADDRESS_ZERO && to.id !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: to.id })
    }
}

async function updateLiquidityPositionForAddress(store: Store, data: { pairId: string; userId: string }) {
    const { pairId, userId } = data

    let position = await getPosition(store, `${pairId}-${userId}`)

    if (!position) {
        const pair = await getPair(store, pairId)
        const user = await getUser(store, userId)

        position = createLiquidityPosition({
            pair,
            user,
        })

        addPosition(position)

        pair.liquidityProviderCount += 1
    }

    const pairContract = pairContracts.get(pairId)
    assert(pairContract != null)

    // const balance = (await addTimeout(pairContract.balanceOf(userId), 30)) as BigNumber
    // position.liquidityTokenBalance = convertTokenToDecimal(balance.toBigInt(), 18)
}

const syncEventAbi = pairAbi.events['Sync(uint112,uint112)']

export async function handleSync(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = getAddress(event.args.address)

    const data = syncEventAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    const token1 = await getToken(ctx.store, pair.token1.id)

    // reset factory liquidity by subtracting onluy tarcked liquidity

    // reset token total liquidity amounts
    token0.totalLiquidity = token0.totalLiquidity.subtract(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.subtract(pair.reserve1)

    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.subtract(pair.trackedReserveETH)

    pair.reserve0 = convertTokenToDecimal(data.reserve0.toBigInt(), Number(token0.decimals))
    pair.reserve1 = convertTokenToDecimal(data.reserve1.toBigInt(), Number(token1.decimals))

    pair.token0Price = pair.reserve1.compareTo(ZERO_BD) !== 0 ? pair.reserve0.divide(pair.reserve1, 8) : ZERO_BD
    pair.token1Price = pair.reserve0.compareTo(ZERO_BD) !== 0 ? pair.reserve1.divide(pair.reserve0, 8) : ZERO_BD


    // update ETH price now that reserves could have changed

    bundle.ethPrice = await getEthPriceInUSD(ctx.store)

    token0.derivedETH = await findEthPerToken(ctx.store, token0)
    token1.derivedETH = await findEthPerToken(ctx.store, token1)

    // get tracked liquidity - will be 0 if neither is in whitelist
    const trackedLiquidityETH =
        bundle.ethPrice.compareTo(ZERO_BD) !== 0
            ? (await getTrackedLiquidityUSD(ctx.store, pair.reserve0, token0.id, pair.reserve1, token1.id)).divide(
                  bundle.ethPrice,
                  8
              )
            : ZERO_BD

    // use derived amounts within pair
    pair.trackedReserveETH = trackedLiquidityETH
    pair.reserveETH = pair.reserve0.multiply(token0.derivedETH).add(pair.reserve1.multiply(token1.derivedETH))
    pair.reserveUSD = pair.reserveETH.multiply(bundle.ethPrice)

    // use tracked amounts globally
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.add(trackedLiquidityETH)
    uniswap.totalLiquidityUSD = uniswap.totalLiquidityETH.add(bundle.ethPrice)

    // now correctly set liquidity amounts for each token
    token0.totalLiquidity = token0.totalLiquidity.add(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.add(pair.reserve1)
}

const MintAbi = pairAbi.events['Mint(address,uint256,uint256)']

export async function handleMint(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = getAddress(event.args.address)

    const data = MintAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const transaction = await getTransaction(ctx.store, event.evmTxHash)
    assert(transaction != null, event.evmTxHash)

    const mintsLength = transaction.mints.length
    const mint = await getMint(ctx.store, transaction.mints[mintsLength - 1])
    assert(mint != null, transaction.mints[mintsLength - 1])

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    const token0Amount = convertTokenToDecimal(data.amount0.toBigInt(), Number(token0.decimals))
    token0.txCount += 1

    const token1 = await getToken(ctx.store, pair.token1.id)
    const token1Amount = convertTokenToDecimal(data.amount1.toBigInt(), Number(token1.decimals))
    token1.txCount += 1

    // get new amounts of USD and ETH for tracking

    const amountTotalUSD = token1.derivedETH
        .multiply(token1Amount)
        .add(token0.derivedETH.multiply(token0Amount))
        .multiply(bundle.ethPrice)

    // update txn counts
    pair.txCount += 1
    uniswap.txCount += 1

    mint.sender = data.sender
    mint.amount0 = token0Amount
    mint.amount1 = token1Amount
    mint.logIndex = event.pos
    mint.amountUSD = amountTotalUSD

    // update the LP position
    await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: data.sender })
}

export type BurnData = {
    amount0: bigint
    amount1: bigint
    logIndex: number
    transactionId: string
    pairId: string
    senderId: string
}

const BurnAbi = pairAbi.events['Burn(address,uint256,uint256,address)']

export async function handleBurn(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = getAddress(event.args.address)

    const data = BurnAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const transaction = await getTransaction(ctx.store, event.evmTxHash)
    assert(transaction != null)

    const pair = await getPair(ctx.store, contractAddress)

    const burn = await getBurn(ctx.store, transaction.burns[transaction.burns.length - 1])
    assert(burn != null)

    // update txn counts
    pair.txCount += 1

    // update txn counts
    uniswap.txCount += 1

    // update txn counts
    const token0 = await getToken(ctx.store, pair.token0.id)
    const token0Amount = convertTokenToDecimal(data.amount0.toBigInt(), Number(token0.decimals))
    token0.txCount += 1

    const token1 = await getToken(ctx.store, pair.token1.id)
    const token1Amount = convertTokenToDecimal(data.amount1.toBigInt(), Number(token1.decimals))
    token1.txCount += 1

    // get new amounts of USD and ETH for tracking
    const amountTotalUSD = token1.derivedETH
        .multiply(token1Amount)
        .add(token0.derivedETH.multiply(token0Amount))
        .multiply(bundle.ethPrice)

    // update burn
    burn.sender = data.sender
    burn.amount0 = token0Amount
    burn.amount1 = token1Amount
    // burn.to = event.params.to
    burn.logIndex = event.pos
    burn.amountUSD = amountTotalUSD

    await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: data.sender })
}

const SwapAbi = pairAbi.events['Swap(address,uint256,uint256,uint256,uint256,address)']

export async function handleSwap(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = getAddress(event.args.address)

    const data = SwapAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    const amount0In = convertTokenToDecimal(data.amount0In.toBigInt(), Number(token0.decimals))
    const amount0Out = convertTokenToDecimal(data.amount0Out.toBigInt(), Number(token0.decimals))
    const amount0Total = amount0Out.add(amount0In)

    const token1 = await getToken(ctx.store, pair.token1.id)
    const amount1In = convertTokenToDecimal(data.amount1In.toBigInt(), Number(token1.decimals))
    const amount1Out = convertTokenToDecimal(data.amount1Out.toBigInt(), Number(token1.decimals))
    const amount1Total = amount1Out.add(amount1In)

    // get total amounts of derived USD and ETH for tracking
    const derivedAmountETH = token1.derivedETH
        .multiply(amount1Total)
        .add(token0.derivedETH.multiply(amount0Total))
        .divide(new bigDecimal(2), 8)
    const derivedAmountUSD = derivedAmountETH.multiply(bundle.ethPrice)
    // only accounts for volume through white listed tokens
    const trackedAmountUSD = await getTrackedVolumeUSD(bundle, amount0Total, token0, amount1Total, token1, pair)
    const trackedAmountETH =
        bundle.ethPrice.compareTo(ZERO_BD) === 0 ? ZERO_BD : trackedAmountUSD.divide(bundle.ethPrice, 8)
    // update token0 global volume and token liquidity stats
    token0.tradeVolume = token0.tradeVolume.add(amount0Total)
    token0.tradeVolumeUSD = token0.tradeVolumeUSD.add(trackedAmountUSD)
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.add(derivedAmountUSD)
    token0.txCount += 1
    // update token1 global volume and token liquidity stats
    token1.tradeVolume = token1.tradeVolume.add(amount1Total)
    token1.tradeVolumeUSD = token1.tradeVolumeUSD.add(trackedAmountUSD)
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.add(derivedAmountUSD)
    token1.txCount += 1
    // update pair volume data, use tracked amount if we have it as its probably more accurate
    pair.volumeUSD = pair.volumeUSD.add(trackedAmountUSD)
    pair.volumeToken0 = pair.volumeToken0.add(amount0Total)
    pair.volumeToken1 = pair.volumeToken1.add(amount1Total)
    pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.add(derivedAmountUSD)
    pair.txCount += 1
    // update global values, only used tracked amounts for volume
    uniswap.totalVolumeUSD = uniswap.totalVolumeUSD.add(trackedAmountUSD)
    uniswap.totalVolumeETH = uniswap.totalVolumeETH.add(trackedAmountETH)
    uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.add(derivedAmountUSD)
    uniswap.txCount += 1

    let transaction = await getTransaction(ctx.store, event.evmTxHash)
    if (transaction == null) {
        transaction = new Transaction({
            id: event.evmTxHash,
            blockNumber: block.height,
            timestamp: new Date(block.timestamp),
            mints: [],
            swaps: [],
            burns: [],
        })
        addTransaction(transaction)
    }

    const swapId = `${transaction.id}-${transaction.swaps.length}`

    transaction.swaps.push(swapId)

    const swap = new Swap({
        id: swapId,
        transaction,
        pair,
        timestamp: new Date(block.timestamp),
        logIndex: event.pos,
        sender: data.sender,
        amount0In,
        amount1In,
        amount0Out,
        amount1Out,
        to: data.to,
        // from:
        amountUSD: (trackedAmountUSD.compareTo(ZERO_BD) === 0 ? derivedAmountUSD : trackedAmountUSD).round(8),
    })

    addSwap(swap)
}
