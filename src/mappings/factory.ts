import { EvmLogEvent, SubstrateBlock } from '@subsquid/substrate-processor'
import { Bundle, Pair, Token, UniswapFactory } from '../model'
import * as factoryAbi from '../types/abi/factory'
import { createToken } from './helpers'
import { BatchContext } from '@subsquid/substrate-processor'
import { Store } from '@subsquid/typeorm-store'
import { ZERO_BD } from '../consts'

export async function handleNewPair(
    ctx: BatchContext<Store, unknown>,
    block: SubstrateBlock,
    event: EvmLogEvent
): Promise<void> {
    const contractAddress = event.args.address

    const data = factoryAbi.events['PairCreated(address,address,address,uint256)'].decode(event.args)

    // load factory (create if first exchange)
    let factory = await ctx.store.get(UniswapFactory, contractAddress)
    if (!factory) {
        factory = new UniswapFactory({
            id: contractAddress,
            pairCount: 0,
            totalVolumeETH: ZERO_BD,
            totalLiquidityETH: ZERO_BD,
            totalVolumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            totalLiquidityUSD: ZERO_BD,
            txCount: 0,
        })

        // create new bundle
        const bundle = new Bundle({
            id: '1',
            ethPrice: ZERO_BD,
        })
        await ctx.store.save(bundle)
    }
    factory.pairCount += 1
    await ctx.store.save(factory)

    // create the tokens
    const token0 = await getToken(ctx, block, data.token0.toLowerCase())
    const token1 = await getToken(ctx, block, data.token1.toLowerCase())

    const pair = new Pair({
        id: data.pair.toLowerCase(),
        token0,
        token1,
        liquidityProviderCount: 0,
        createdAtTimestamp: new Date(block.timestamp),
        createdAtBlockNumber: block.height,
        txCount: 0,
        reserve0: ZERO_BD,
        reserve1: ZERO_BD,
        trackedReserveETH: ZERO_BD,
        reserveETH: ZERO_BD,
        reserveUSD: ZERO_BD,
        totalSupply: ZERO_BD,
        volumeToken0: ZERO_BD,
        volumeToken1: ZERO_BD,
        volumeUSD: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        token0Price: ZERO_BD,
        token1Price: ZERO_BD,
    })

    await ctx.store.save(pair)
}

async function getToken(ctx: BatchContext<Store, unknown>, block: SubstrateBlock, address: string): Promise<Token> {
    let token = await ctx.store.get(Token, address)
    if (!token) {
        token = await createToken(ctx, block, address)
        await ctx.store.save(token)
    }

    return token
}
