import { CommonHandlerContext, EvmLogHandlerContext } from '@subsquid/substrate-processor'
import { ADDRESS_ZERO, ZERO_BD } from '../consts'
import { Transaction, TokenSwapEvent, Pair } from '../model'
import { getEthPriceInUSD, findEthPerToken, WHITELIST, MINIMUM_USD_THRESHOLD_NEW_PAIRS } from './pricing'
import * as pairAbi from '../types/abi/pair'
import { convertTokenToDecimal, createLiquidityPosition } from './helpers'
import { Store } from '@subsquid/typeorm-store'
import { getBundle, getPosition, getTransaction, getUniswap } from '../entities/entityUtils'
import { getOrCreateToken } from '../entities/token'
import { getPair } from '../entities/pair'
// import {
//     getPosition,
//     getPair,
//     addPosition,
//     getBundle,
//     getUniswap,
//     getTransaction,
//     addTransaction,
//     addSwap,
//     getOrCreateToken,
// } from './entityUtils'

const transferEventAbi = pairAbi.events['Transfer(address,address,uint256)']

export async function handleTransfer(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const contractAddress = ctx.event.args.address

    const data = transferEventAbi.decode(ctx.event.args)
    // ignore initial transfers for first adds
    if (data.to === ADDRESS_ZERO && data.value.toBigInt() === 1000n) {
        return
    }

    const transactionHash = ctx.event.evmTxHash

    // user stats
    const from = data.from
    const to = data.to

    // get pair and load contract
    const pair = await getPair(ctx, contractAddress)

    // liquidity token amount being transfered
    const value = convertTokenToDecimal(data.value.toBigInt(), 18)

    // get or create transaction
    let transaction = await getTransaction(ctx, ctx.event.evmTxHash)
    if (transaction == null) {
        transaction = new Transaction({
            id: transactionHash,
            blockNumber: ctx.block.height,
            timestamp: new Date(ctx.block.timestamp),
            mints: [],
            burns: [],
            swaps: [],
        })
        await ctx.store.save(transaction)
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
        await updateLiquidityPositionForAddress(ctx, pair, from)
    }

    if (to !== ADDRESS_ZERO && to !== pair.id) {
        await updateLiquidityPositionForAddress(ctx, pair, to)
    }

    await ctx.store.save(pair)
}

async function updateLiquidityPositionForAddress(ctx: CommonHandlerContext<Store>, pair: Pair, userId: string) {
    let position = await getPosition(ctx, `${pair.id}-${userId}`)

    if (!position) {
        position = createLiquidityPosition({
            pair,
            user: userId,
        })

        await ctx.store.save(position)

        pair.liquidityProviderCount += 1
    }

    // const pairContract = pairContracts.get(pairId)
    // assert(pairContract != null)

    // const balance = (await addTimeout(pairContract.balanceOf(userId), 30)) as BigNumber
    // position.liquidityTokenBalance = convertTokenToDecimal(balance.toBigInt(), 1PRECISION)
}

const syncEventAbi = pairAbi.events['Sync(uint112,uint112)']

export async function handleSync(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const contractAddress = ctx.event.args.address

    const data = syncEventAbi.decode(ctx.event.args)

    const bundle = await getBundle(ctx)
    const uniswap = await getUniswap(ctx)

    const pair = await getPair(ctx, contractAddress)

    const token0 = await getOrCreateToken(ctx, pair.token0.id)
    const token1 = await getOrCreateToken(ctx, pair.token1.id)

    // reset factory liquidity by subtracting onluy tarcked liquidity
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.minus(pair.trackedReserveETH)

    // reset token total liquidity amounts
    token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

    pair.reserve0 = convertTokenToDecimal(data.reserve0.toBigInt(), Number(token0.decimals))
    pair.reserve1 = convertTokenToDecimal(data.reserve1.toBigInt(), Number(token1.decimals))

    pair.token0Price = !pair.reserve1.eq(ZERO_BD) ? pair.reserve0.div(pair.reserve1) : ZERO_BD
    pair.token1Price = !pair.reserve0.eq(ZERO_BD) ? pair.reserve1.div(pair.reserve0) : ZERO_BD
    await ctx.store.save(pair)

    // update ETH price now that reserves could have changed
    bundle.ethPrice = await getEthPriceInUSD(ctx)
    await ctx.store.save(bundle)

    token0.derivedETH = await findEthPerToken(ctx, token0.id)
    token1.derivedETH = await findEthPerToken(ctx, token1.id)

    let trackedLiquidityETH = ZERO_BD
    if (!bundle.ethPrice.eq(ZERO_BD)) {
        const price0 = token0.derivedETH.times(bundle.ethPrice)
        const price1 = token1.derivedETH.times(bundle.ethPrice)

        // both are whitelist tokens, take average of both amounts
        if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            trackedLiquidityETH = pair.reserve0.times(price0).plus((pair.reserve1.times(price1)))
        }

        // take double value of the whitelisted token amount
        if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
            trackedLiquidityETH = pair.reserve0.times(price0).times(2)
        }

        // take double value of the whitelisted token amount
        if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            trackedLiquidityETH = pair.reserve1.times(price1).times(2)
        }

        trackedLiquidityETH = bundle.ethPrice.eq(ZERO_BD) ? ZERO_BD : trackedLiquidityETH.div(bundle.ethPrice)
    }

    // use derived amounts within pair
    pair.trackedReserveETH = trackedLiquidityETH
    pair.reserveETH = pair.reserve0.times(token0.derivedETH).plus(pair.reserve1.times(token1.derivedETH))
    pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)
    await ctx.store.save(pair)

    // use tracked amounts globally
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.plus(trackedLiquidityETH)
    uniswap.totalLiquidityUSD = uniswap.totalLiquidityETH.plus(bundle.ethPrice)
    await ctx.store.save(uniswap)

    // now correctly set liquidity amounts for each token
    token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
    token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)
    await ctx.store.save([token0, token1])
}

const MintAbi = pairAbi.events['Mint(address,uint256,uint256)']

export async function handleMint(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const contractAddress = ctx.event.args.address

    const data = MintAbi.decode(ctx.event.args)

    const uniswap = await getUniswap(ctx)

    const pair = await getPair(ctx, contractAddress)

    const token0 = await getOrCreateToken(ctx, pair.token0.id)
    token0.txCount += 1

    const token1 = await getOrCreateToken(ctx, pair.token1.id)
    token1.txCount += 1

    // update txn counts
    pair.txCount += 1

    // update txn counts
    uniswap.txCount += 1

    // update the LP position
    await updateLiquidityPositionForAddress(ctx, pair, data.sender)

    await ctx.store.save(uniswap)
    await ctx.store.save(pair)
    await ctx.store.save([token0, token1])
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

export async function handleBurn(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const contractAddress = ctx.event.args.address

    const data = BurnAbi.decode(ctx.event.args)

    const uniswap = await getUniswap(ctx)

    const pair = await getPair(ctx, contractAddress)

    // update txn counts
    pair.txCount += 1

    // update txn counts
    uniswap.txCount += 1

    // update txn counts
    const token0 = await getOrCreateToken(ctx, pair.token0.id)
    token0.txCount += 1

    const token1 = await getOrCreateToken(ctx, pair.token1.id)
    token1.txCount += 1

    await updateLiquidityPositionForAddress(ctx, pair, data.sender)

    await ctx.store.save(uniswap)
    await ctx.store.save(pair)
    await ctx.store.save([token0, token1])
}

const SwapAbi = pairAbi.events['Swap(address,uint256,uint256,uint256,uint256,address)']

export async function handleSwap(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const contractAddress = ctx.event.args.address

    const data = SwapAbi.decode(ctx.event.args)

    const bundle = await getBundle(ctx)
    const uniswap = await getUniswap(ctx)

    const pair = await getPair(ctx, contractAddress)

    const token0 = await getOrCreateToken(ctx, pair.token0.id)
    const amount0In = convertTokenToDecimal(data.amount0In.toBigInt(), Number(token0.decimals))
    const amount0Out = convertTokenToDecimal(data.amount0Out.toBigInt(), Number(token0.decimals))
    const amount0Total = amount0Out.plus(amount0In)

    const token1 = await getOrCreateToken(ctx, pair.token1.id)
    const amount1In = convertTokenToDecimal(data.amount1In.toBigInt(), Number(token1.decimals))
    const amount1Out = convertTokenToDecimal(data.amount1Out.toBigInt(), Number(token1.decimals))
    const amount1Total = amount1Out.plus(amount1In)

    // get total amounts of derived USD and ETH for tracking
    const derivedAmountETH = token1.derivedETH.times(amount1Total).plus(token0.derivedETH.times(amount0Total)).div(2)
    const derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)
    // only accounts for volume through white listed tokens

    let trackedAmountUSD = ZERO_BD

    const price0 = token0.derivedETH.times(bundle.ethPrice)
    const price1 = token1.derivedETH.times(bundle.ethPrice)

    const reserve0USD = pair.reserve0.times(price0)
    const reserve1USD = pair.reserve1.times(price1)

    // if less than 5 LPs, require high minimum reserve amount amount or return 0
    if (
        pair.liquidityProviderCount < 5 &&
        ((WHITELIST.includes(token0.id) &&
            WHITELIST.includes(token1.id) &&
            reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) ||
            (WHITELIST.includes(token0.id) &&
                !WHITELIST.includes(token1.id) &&
                reserve0USD.times(2).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) ||
            (!WHITELIST.includes(token0.id) &&
                WHITELIST.includes(token1.id) &&
                reserve1USD.times(2).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)))
    ) {
        // do nothing
    } else {
        // both are whitelist tokens, take average of both amounts
        if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            trackedAmountUSD = amount0Total.times(price0).plus(amount1Total.times(price1)).div(2)
        }

        // take full value of the whitelisted token amount
        if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
            trackedAmountUSD = amount0Total.times(price0)
        }

        // take full value of the whitelisted token amount
        if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            trackedAmountUSD = amount1Total.times(price1)
        }
    }

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
    await ctx.store.save([token0, token1])

    // update pair volume data, use tracked amount if we have it as its probably more accurate
    pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
    pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
    pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
    pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
    pair.txCount += 1
    await ctx.store.save(pair)

    // update global values, only used tracked amounts for volume
    uniswap.totalVolumeUSD = uniswap.totalVolumeUSD.plus(trackedAmountUSD)
    uniswap.totalVolumeETH = uniswap.totalVolumeETH.plus(trackedAmountETH)
    uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.plus(derivedAmountUSD)
    uniswap.txCount += 1
    await ctx.store.save(uniswap)

    let transaction = await getTransaction(ctx, ctx.event.evmTxHash)
    if (transaction == null) {
        transaction = new Transaction({
            id: ctx.event.evmTxHash,
            blockNumber: ctx.block.height,
            timestamp: new Date(ctx.block.timestamp),
            mints: [],
            swaps: [],
            burns: [],
        })
        await ctx.store.save(transaction)
    }

    const swapId = `${transaction.id}-${transaction.swaps.length}`

    transaction.swaps.push(swapId)
    await ctx.store.save(transaction)

    // if (amount0Total.eq(0) && amount1Total.eq(0)) return

    const swap = new TokenSwapEvent({
        id: swapId,
        transaction,
        pair,
        timestamp: new Date(ctx.block.timestamp),
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

    await ctx.store.save(swap)
}
