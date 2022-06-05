import { EvmLogHandlerContext, Store } from '@subsquid/substrate-evm-processor'
import { Bundle, Pair, Token, UniswapFactory } from '../model'
import * as factoryAbi from '../types/abi/factory'
import { ZERO_BD, ZERO_BI } from '../consts'
import { createToken } from './helpers'
import { getAddress } from 'ethers/lib/utils'

export async function handleNewPair(ctx: EvmLogHandlerContext): Promise<void> {
    const contractAddress = getAddress(ctx.contractAddress)

    const event = factoryAbi.events['PairCreated(address,address,address,uint256)'].decode(ctx)
    // load factory (create if first exchange)
    let factory = await ctx.store.findOne(UniswapFactory, contractAddress)
    if (!factory) {
        factory = new UniswapFactory({
            id: contractAddress,
            pairCount: 0,
            totalVolumeETH: ZERO_BD,
            totalLiquidityETH: ZERO_BD,
            totalVolumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            totalLiquidityUSD: ZERO_BD,
            txCount: ZERO_BI,
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
    const token0 = await getToken(ctx.store, event.token0)
    const token1 = await getToken(ctx.store, event.token1)

    const pair = new Pair({
        id: event.pair,
        token0,
        token1,
        liquidityProviderCount: ZERO_BI,
        createdAtTimestamp: BigInt(ctx.substrate.block.timestamp),
        createdAtBlockNumber: BigInt(ctx.substrate.block.height),
        txCount: ZERO_BI,
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

    // if (!knownContracts.indexOf(event.pair))
    //   throw new Error(`Unknown new pair contract address ${event.pair}`);
}

export async function getToken(store: Store, address: string): Promise<Token> {
    let token = await store.get(Token, address)
    if (!token) {
        token = await createToken(address)
        await store.save(token)
    }

    return token
}
