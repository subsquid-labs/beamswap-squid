import { ZERO_BD, ONE_BD } from '../consts'
import { Store } from '@subsquid/typeorm-store'
import { Big as BigDecimal } from 'big.js'
import { getOrCreateToken } from '../entities/token'
import { CommonHandlerContext } from '@subsquid/substrate-processor'
import { getPair } from '../entities/pair'
import { Pair } from '../model'

export const WGLMR_ADDRESS = '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase() //Replace with wrapped glint
export const WGLMR_USDC_ADDRESS = '0xb929914B89584b4081C7966AC6287636F7EfD053'.toLowerCase() //replace with wglint usdc LP address
export const USDC = '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase() // replace with USDC address

export const WHITELIST: string[] = [
    '0xcd3B51D98478D53F4515A306bE565c6EebeF1D58'.toLowerCase(), //GLINT
    '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase(), //WGLINT
    '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase(), //USDC
]

export async function getEthPriceInUSD(ctx: CommonHandlerContext<Store>): Promise<BigDecimal> {
    const usdcPair = await getPair(ctx, WGLMR_USDC_ADDRESS)

    // console.log(`usdcPair ${usdcPair.token0Price}, ${usdcPair.token1Price}`)
    return usdcPair.token0.id === USDC ? usdcPair.token0Price : usdcPair.token1Price
}

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = new BigDecimal(3000)

// minimum liquidity for price to get tracked
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = new BigDecimal(5)

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (plus stablecoin estimates)
 **/
export async function findEthPerToken(ctx: CommonHandlerContext<Store>, tokenId: string): Promise<BigDecimal> {
    if (tokenId === WGLMR_ADDRESS) {
        return ONE_BD
    }

    const whitelistPairs = await ctx.store.find(Pair, {
        where: WHITELIST.map((t) => [
            { token0: { id: t }, token1: { id: tokenId } },
            { token1: { id: t }, token0: { id: tokenId } },
        ]).flat(),
        relations: {
            token0: true,
            token1: true,
        },
    })

    // loop through whitelist and check if paired with any
    for (const pair of whitelistPairs) {
        if (pair.reserveETH.lte(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) continue

        if (pair.token0.id === tokenId) {
            const token1 = await getOrCreateToken(ctx, pair.token1.id)
            return pair.token1Price.mul(token1.derivedETH) // return token1 per our token * Eth per token 1
        }
        if (pair.token1.id === tokenId) {
            const token0 = await getOrCreateToken(ctx, pair.token0.id)
            return pair.token0Price.mul(token0.derivedETH) // return token0 per our token * ETH per token 0
        }
    }
    return ZERO_BD // nothing was found return 0
}
