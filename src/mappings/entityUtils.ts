import { Store } from '@subsquid/typeorm-store'
import assert from 'assert'
import { FACTORY_ADDRESS } from '../consts'
import { UniswapFactory, Bundle, Pair, Token, LiquidityPosition, Transaction, TokenSwapEvent } from '../model'

let uniswap: UniswapFactory | undefined

export async function getUniswap(store: Store) {
    if (!uniswap) {
        uniswap = await store.get(UniswapFactory, FACTORY_ADDRESS)
        assert(uniswap != null)
    }

    return uniswap
}

let bundle: Bundle | undefined

export async function getBundle(store: Store) {
    if (!bundle) {
        bundle = await store.get(Bundle, '1')
        assert(bundle != null)
    }

    return bundle
}

const pairs: Map<string, Pair> = new Map()

export async function getPair(store: Store, id: string) {
    let item = pairs.get(id)

    if (item == null) {
        item = await store.get(Pair, {
            where: { id },
            relations: { token0: true, token1: true },
        })
        assert(item != null, id)
        if (item) pairs.set(item.id, item)
    }

    return item
}

const tokens: Map<string, Token> = new Map()

export async function getToken(store: Store, id: string) {
    let item = tokens.get(id)

    if (item == null) {
        item = await store.get(Token, id)
        assert(item != null)
        if (item) tokens.set(item.id, item)
    }

    return item
}

const transactions: Map<string, Transaction> = new Map()

export async function getTransaction(store: Store, id: string) {
    let item = transactions.get(id)

    if (item == null) {
        item = await store.get(Transaction, id)
        if (item) transactions.set(item.id, item)
    }

    return item
}

export function addTransaction(item: Transaction) {
    transactions.set(item.id, item)
}

const swaps: Map<string, TokenSwapEvent> = new Map()

export function addSwap(item: TokenSwapEvent) {
    swaps.set(item.id, item)
}

const positions: Map<string, LiquidityPosition> = new Map()

export async function getPosition(store: Store, id: string) {
    let item = positions.get(id)

    if (item == null) {
        item = await store.get(LiquidityPosition, id)
        if (item) positions.set(item.id, item)
    }

    return item
}

export function addPosition(item: LiquidityPosition) {
    positions.set(item.id, item)
}

export async function saveAll(store: Store) {
    if (uniswap != null) await store.save(uniswap)

    if (bundle != null) await store.save(bundle)

    await store.save([...tokens.values()])

    await store.save([...pairs.values()])

    await store.save([...transactions.values()])
    transactions.clear()

    await store.save([...swaps.values()])
    swaps.clear()

    await store.save([...positions.values()])
    positions.clear()
}

const pairsAdressesCache: Map<string, string> = new Map()

export async function getPairByTokens(store: Store, token0: string, token1: string) {
    let address = pairsAdressesCache.get(`${token0}-${token1}`)
    if (address) return await getPair(store, address)

    address = pairsAdressesCache.get(`${token1}-${token0}`)
    if (address) return await getPair(store, address)

    address = [...pairs.values()].find(
        (p) => (p.token0.id === token0 && p.token1.id === token1) || (p.token1.id === token0 && p.token0.id === token1)
    )?.id
    if (address) {
        pairsAdressesCache.set(`${token0}-${token1}`, address)
        return await getPair(store, address)
    }

    address = (
        await store.get(Pair, {
            where: [
                { token0: { id: token0 }, token1: { id: token1 } },
                { token0: { id: token1 }, token1: { id: token0 } },
            ],
            relations: {
                token0: true,
                token1: true,
            },
        })
    )?.id
    if (address) {
        pairsAdressesCache.set(`${token0}-${token1}`, address)
        return await getPair(store, address)
    }

    return undefined
}
