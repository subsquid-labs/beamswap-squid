import {CommonHandlerContext} from "@subsquid/substrate-processor"
import {Store} from "@subsquid/typeorm-store"
import assert from "assert"
import {Pair} from "../model"

export async function getPair(ctx: CommonHandlerContext<Store>, id: string) {
    const item = await ctx.store.get(Pair, {
        where: { id },
        relations: { token0: true, token1: true },
    })
    assert(item != null, id)

    return item
}

const pairsAdressesCache: Map<string, string> = new Map()

export async function getPairByTokens(ctx: CommonHandlerContext<Store>, token0: string, token1: string) {
    let address = pairsAdressesCache.get(`${token0}-${token1}`)
    if (address) return await ctx.store.get(Pair, address)

    address = pairsAdressesCache.get(`${token1}-${token0}`)
    if (address) return await ctx.store.get(Pair, address)

    const pair = await ctx.store.get(Pair, {
        where: [
            { token0: { id: token0 }, token1: { id: token1 } },
            { token0: { id: token1 }, token1: { id: token0 } },
        ],
        relations: {
            token0: true,
            token1: true,
        },
    })
    if (pair) {
        pairsAdressesCache.set(`${token0}-${token1}`, pair.id)
    }

    return undefined
}
