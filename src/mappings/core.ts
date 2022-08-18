import { SubstrateBlock } from '@subsquid/substrate-processor'
import { ADDRESS_ZERO, ZERO_BD } from '../consts'
import { Transaction, TokenSwapEvent } from '../model'
import { getEthPriceInUSD, findEthPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD } from './pricing'
import * as pairAbi from '../types/abi/pair'
import { convertTokenToDecimal, createLiquidityPosition } from './helpers'
import assert from 'assert'
import { BatchContext, EvmLogEvent } from '@subsquid/substrate-processor'
import { Store } from '@subsquid/typeorm-store'
import {
    getPosition,
    getPair,
    addPosition,
    getBundle,
    getUniswap,
    getTransaction,
    addTransaction,
    addSwap,
    getToken,
} from './entityUtils'

const transferEventAbi = pairAbi.events['Transfer(address,address,uint256)']

export async function handleTransfer(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = event.args.address

    const data = transferEventAbi.decode(event.args)
    // ignore initial transfers for first adds
    if (data.to === ADDRESS_ZERO && data.value.toBigInt() === 1000n) {
        return
    }

    const transactionHash = event.evmTxHash

    // user stats
    const from = data.from
    const to = data.to

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
    if (from === ADDRESS_ZERO) {
        pair.totalSupply = pair.totalSupply.plus(value)
    }

    // burn
    if (to == ADDRESS_ZERO && from == pair.id) {
        pair.totalSupply = pair.totalSupply.minus(value)
    }

    if (from !== ADDRESS_ZERO && from !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: from })
    }

    if (to !== ADDRESS_ZERO && to !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: to })
    }
}

async function updateLiquidityPositionForAddress(store: Store, data: { pairId: string; userId: string }) {
    const { pairId, userId } = data

    let position = await getPosition(store, `${pairId}-${userId}`)

    if (!position) {
        const pair = await getPair(store, pairId)

        position = createLiquidityPosition({
            pair,
            user: userId,
        })

        addPosition(position)

        pair.liquidityProviderCount += 1
    }

    // const pairContract = pairContracts.get(pairId)
    // assert(pairContract != null)

    // const balance = (await addTimeout(pairContract.balanceOf(userId), 30)) as BigNumber
    // position.liquidityTokenBalance = convertTokenToDecimal(balance.toBigInt(), 1PRECISION)
}

const syncEventAbi = pairAbi.events['Sync(uint112,uint112)']

export async function handleSync(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = event.args.address

    const data = syncEventAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    const token1 = await getToken(ctx.store, pair.token1.id)

    // reset factory liquidity by subtracting onluy tarcked liquidity

    // reset token total liquidity amounts
    token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.minus(pair.trackedReserveETH)

    pair.reserve0 = convertTokenToDecimal(data.reserve0.toBigInt(), Number(token0.decimals))
    pair.reserve1 = convertTokenToDecimal(data.reserve1.toBigInt(), Number(token1.decimals))

    pair.token0Price = !pair.reserve1.eq(ZERO_BD) ? pair.reserve0.div(pair.reserve1) : ZERO_BD
    pair.token1Price = !pair.reserve0.eq(ZERO_BD) ? pair.reserve1.div(pair.reserve0) : ZERO_BD

    // update ETH price now that reserves could have changed

    bundle.ethPrice = await getEthPriceInUSD(ctx.store)

    token0.derivedETH = await findEthPerToken(ctx.store, token0.id)
    token1.derivedETH = await findEthPerToken(ctx.store, token1.id)

    // get tracked liquidity - will be 0 if neither is in whitelist
    const trackedLiquidityETH = !bundle.ethPrice.eq(ZERO_BD)
        ? (await getTrackedLiquidityUSD(ctx.store, token0.id, pair.reserve0, token1.id, pair.reserve1)).div(
              bundle.ethPrice
          )
        : ZERO_BD

    // use derived amounts within pair
    pair.trackedReserveETH = trackedLiquidityETH
    pair.reserveETH = pair.reserve0.mul(token0.derivedETH).plus(pair.reserve1.mul(token1.derivedETH))
    pair.reserveUSD = pair.reserveETH.mul(bundle.ethPrice)

    // use tracked amounts globally
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.plus(trackedLiquidityETH)
    uniswap.totalLiquidityUSD = uniswap.totalLiquidityETH.plus(bundle.ethPrice)

    // now correctly set liquidity amounts for each token
    token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)
}

const MintAbi = pairAbi.events['Mint(address,uint256,uint256)']

export async function handleMint(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = event.args.address

    const data = MintAbi.decode(event.args)

    const uniswap = await getUniswap(ctx.store)

    const transaction = await getTransaction(ctx.store, event.evmTxHash)
    assert(transaction != null, event.evmTxHash)

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    token0.txCount += 1

    const token1 = await getToken(ctx.store, pair.token1.id)
    token1.txCount += 1

    // update txn counts
    pair.txCount += 1
    uniswap.txCount += 1

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
    const contractAddress = event.args.address

    const data = BurnAbi.decode(event.args)

    const uniswap = await getUniswap(ctx.store)

    const transaction = await getTransaction(ctx.store, event.evmTxHash)
    assert(transaction != null)

    const pair = await getPair(ctx.store, contractAddress)

    // update txn counts
    pair.txCount += 1

    // update txn counts
    uniswap.txCount += 1

    // update txn counts
    const token0 = await getToken(ctx.store, pair.token0.id)
    token0.txCount += 1

    const token1 = await getToken(ctx.store, pair.token1.id)
    token1.txCount += 1

    await updateLiquidityPositionForAddress(ctx.store, { pairId: pair.id, userId: data.sender })
}

const SwapAbi = pairAbi.events['Swap(address,uint256,uint256,uint256,uint256,address)']

export async function handleSwap(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = event.args.address

    const data = SwapAbi.decode(event.args)

    const bundle = await getBundle(ctx.store)
    const uniswap = await getUniswap(ctx.store)

    const pair = await getPair(ctx.store, contractAddress)

    const token0 = await getToken(ctx.store, pair.token0.id)
    const amount0In = convertTokenToDecimal(data.amount0In.toBigInt(), Number(token0.decimals))
    const amount0Out = convertTokenToDecimal(data.amount0Out.toBigInt(), Number(token0.decimals))
    const amount0Total = amount0Out.plus(amount0In)

    const token1 = await getToken(ctx.store, pair.token1.id)
    const amount1In = convertTokenToDecimal(data.amount1In.toBigInt(), Number(token1.decimals))
    const amount1Out = convertTokenToDecimal(data.amount1Out.toBigInt(), Number(token1.decimals))
    const amount1Total = amount1Out.plus(amount1In)


    // get total amounts of derived USD and ETH for tracking
    const derivedAmountETH = token1.derivedETH.mul(amount1Total).plus(token0.derivedETH.mul(amount0Total)).div(2)
    const derivedAmountUSD = derivedAmountETH.mul(bundle.ethPrice)
    // only accounts for volume through white listed tokens
    const trackedAmountUSD = await getTrackedVolumeUSD(ctx.store, token0.id, amount0Total, token1.id, amount1Total)
    const trackedAmountETH = bundle.ethPrice.eq(ZERO_BD) ? ZERO_BD : trackedAmountUSD.div(bundle.ethPrice)
    // update token0 global volume and token liquidity stats
    token0.tradeVolume = token0.tradeVolume.plus(amount0Total)
    token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD)
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD)
    token0.txCount += 1
    // update token1 global volume and token liquidity stats
    token1.tradeVolume = token1.tradeVolume.plus(amount1Total)
    token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD)
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD)
    token1.txCount += 1
    // update pair volume data, use tracked amount if we have it as its probably more accurate
    pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
    pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
    pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
    pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
    pair.txCount += 1
    // update global values, only used tracked amounts for volume
    uniswap.totalVolumeUSD = uniswap.totalVolumeUSD.plus(trackedAmountUSD)
    uniswap.totalVolumeETH = uniswap.totalVolumeETH.plus(trackedAmountETH)
    uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.plus(derivedAmountUSD)
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

    if (amount0Total.eq(0) && amount1Total.eq(0)) return

    const swap = new TokenSwapEvent({
        id: swapId,
        transaction,
        pair,
        timestamp: new Date(block.timestamp),
        tokenSold: amount0In.eq(0) ? token1 : token0,
        soldAmount: data.amount0In.toBigInt() || data.amount1In.toBigInt(),
        tokenBought: amount0Out.eq(0) ? token1 : token0,
        boughtAmount: data.amount0Out.toBigInt() || data.amount1Out.toBigInt(),
        buyer: data.sender.toLowerCase(),
        // sender: data.sender.toLowerCase(),
        // to: data.to.toLowerCase(),
        // from:
        amountUSD: trackedAmountUSD.eq(ZERO_BD) ? derivedAmountUSD : trackedAmountUSD,
    })

    addSwap(swap)
}
