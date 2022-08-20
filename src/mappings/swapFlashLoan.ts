import { getBalancesSwap, getOrCreatePool } from '../entities/swap'
import { getOrCreateToken } from '../entities/token'
import { TokenSwapEvent } from '../model'
import { EvmLogHandlerContext } from '@subsquid/substrate-processor'
import { Store } from '@subsquid/typeorm-store'
import * as SwapFlash from '../types/abi/swapFlashLoan'
import { convertTokenToDecimal } from './helpers'

export async function handleNewAdminFee(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)

    const event = SwapFlash.events['NewAdminFee(uint256)'].decode(ctx.event.args)
    pool.adminFee = event.newAdminFee.toBigInt()

    await ctx.store.save(pool)
}

export async function handleNewSwapFee(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)

    const event = SwapFlash.events['NewSwapFee(uint256)'].decode(ctx.event.args)
    pool.swapFee = event.newSwapFee.toBigInt()

    await ctx.store.save(pool)
}

export async function handleStopRampA(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)

    const event = SwapFlash.events['StopRampA(uint256,uint256)'].decode(ctx.event.args)
    pool.a = event.currentA.toBigInt()

    await ctx.store.save(pool)
}

export async function handleAddLiquidity(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)

    // const event = SwapFlash.events['AddLiquidity(address,uint256[],uint256[],uint256,uint256)'].decode(ctx.event.args)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)

    await ctx.store.save(pool)
}

export async function handleRemoveLiquidity(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)
    await ctx.store.save(pool)
}

export async function handleRemoveLiquidityOne(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)
    await ctx.store.save(pool)
}

export async function handleRemoveLiquidityImbalance(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)
    await ctx.store.save(pool)
}

export async function handleFlashLoan(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)
    await ctx.store.save(pool)
}

export async function handleTokenSwap(ctx: EvmLogHandlerContext<Store>): Promise<void> {
    const pool = await getOrCreatePool(ctx, ctx.event.args.address)
    pool.balances = await getBalancesSwap(ctx, ctx.event.args.address, pool.numTokens)
    await ctx.store.save(pool)

    const event = SwapFlash.events['TokenSwap(address,uint256,uint256,uint128,uint128)'].decode(ctx.event.args)

    const usdPrice = 1

    const tokenSold = await getOrCreateToken(ctx, pool.tokens[event.soldId.toNumber()])
    const soldAmount = event.tokensSold.toBigInt()
    const tokenBought = await getOrCreateToken(ctx, pool.tokens[event.boughtId.toNumber()])
    const boughtAmount = event.tokensBought.toBigInt()

    const exchange = new TokenSwapEvent({
        id: 'token_exchange-' + ctx.event.evmTxHash,

        timestamp: new Date(ctx.block.timestamp),

        pool,

        buyer: event.buyer,
        tokenSold,
        soldAmount,
        tokenBought,
        boughtAmount,

        amountUSD: convertTokenToDecimal(soldAmount, tokenSold.decimals)
            .plus(convertTokenToDecimal(boughtAmount, tokenBought.decimals))
            .div(2)
            .mul(usdPrice),
    })

    await ctx.store.save(exchange)

    // // save trade volume
    // const tokens = pool.tokens
    // if (
    //   event.params.soldId.toI32() < tokens.length &&
    //   event.params.boughtId.toI32() < tokens.length
    // ) {
    //   const soldToken = getOrCreateToken(
    //     Address.fromString(tokens[event.params.soldId.toI32()]),
    //     event.block,
    //     event.transaction,
    //   )
    //   const sellVolume = decimal.fromBigInt(
    //     event.params.tokensSold,
    //     soldToken.decimals.toI32(),
    //   )
    //   const boughtToken = getOrCreateToken(
    //     Address.fromString(tokens[event.params.boughtId.toI32()]),
    //     event.block,
    //     event.transaction,
    //   )
    //   const buyVolume = decimal.fromBigInt(
    //     event.params.tokensBought,
    //     boughtToken.decimals.toI32(),
    //   )
    //   const volume = sellVolume.plus(buyVolume).div(decimal.TWO)
    // }
}