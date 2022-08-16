import { ZERO_BD, ONE_BD } from '../consts'
import { Store } from '@subsquid/typeorm-store'
import { getBundle, getPair, getPairByTokens } from './entityUtils'
import { getToken } from './entityUtils'
import { Big as BigDecimal } from 'big.js'
import assert from 'assert'

const WGLMR_ADDRESS = '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase() //Replace with wrapped glint
const WGLMR_USDC_ADDRESS = '0xb929914B89584b4081C7966AC6287636F7EfD053'.toLowerCase() //replace with wglint usdc LP address
const USDC = '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase() // replace with USDC address

const WHITELIST: string[] = [
    '0xcd3B51D98478D53F4515A306bE565c6EebeF1D58'.toLowerCase(), //GLINT
    '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase(), //WGLINT
    '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b'.toLowerCase(), //USDC
]

export async function getEthPriceInUSD(store: Store): Promise<BigDecimal> {
    const usdcPair = await getPair(store, WGLMR_USDC_ADDRESS)

    console.log(`usdcPair ${usdcPair.token0Price}, ${usdcPair.token1Price}`)
    return usdcPair.token0.id === USDC ? BigDecimal(usdcPair.token0Price) : BigDecimal(usdcPair.token1Price)
}

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
const MINIMUM_USD_THRESHOLD_NEW_PAIRS = new BigDecimal(3000)

// minimum liquidity for price to get tracked
const MINIMUM_LIQUIDITY_THRESHOLD_ETH = new BigDecimal(5)

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (plus stablecoin estimates)
 **/
export async function findEthPerToken(store: Store, tokenId: string): Promise<BigDecimal> {
    if (tokenId === WGLMR_ADDRESS) {
        return ONE_BD
    }
    // loop through whitelist and check if paired with any
    for (let i = 0; i < WHITELIST.length; ++i) {
        const pair = await getPairByTokens(store, tokenId, WHITELIST[i])

        if (!pair) continue

        if (pair.reserveETH.lte(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) continue

        if (pair.token0.id === tokenId) {
            const token1 = await getToken(store, pair.token1.id)
            return pair.token1Price.mul(token1.derivedETH) // return token1 per our token * Eth per token 1
        }
        if (pair.token1.id === tokenId) {
            const token0 = await getToken(store, pair.token0.id)
            return pair.token0Price.mul(token0.derivedETH) // return token0 per our token * ETH per token 0
        }
    }
    return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export async function getTrackedVolumeUSD(
    store: Store,
    token0Id: string,
    tokenAmount0: BigDecimal,
    token1Id: string,
    tokenAmount1: BigDecimal
): Promise<BigDecimal> {
    const bundle = await getBundle(store)

    const pair = await getPairByTokens(store, token0Id, token1Id)
    assert(pair != null)

    const token0 = await getToken(store, token0Id)
    const token1 = await getToken(store, token1Id)

    const price0 = token0.derivedETH.mul(bundle.ethPrice)
    const price1 = token1.derivedETH.mul(bundle.ethPrice)

    // if less than 5 LPs, require high minimum reserve amount amount or return 0
    if (pair.liquidityProviderCount < 5) {
        const reserve0USD = pair.reserve0.mul(price0)
        const reserve1USD = pair.reserve1.mul(price1)
        if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
                return ZERO_BD
            }
        }
        if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
            if (reserve0USD.mul(2).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
                return ZERO_BD
            }
        }
        if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            if (reserve1USD.mul(2).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
                return ZERO_BD
            }
        }
    }

    // both are whitelist tokens, take average of both amounts
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return BigDecimal(tokenAmount0).mul(price0).plus(tokenAmount1.mul(price1)).div(2)
    }

    // take full value of the whitelisted token amount
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
        return tokenAmount0.mul(price0)
    }

    // take full value of the whitelisted token amount
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount1.mul(price1)
    }

    // neither token is on white list, tracked volume is 0
    return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export async function getTrackedLiquidityUSD(
    store: Store,
    token0Id: string,
    tokenAmount0: BigDecimal,
    token1Id: string,
    tokenAmount1: BigDecimal
): Promise<BigDecimal> {
    const bundle = await getBundle(store)

    const pair = await getPairByTokens(store, token0Id, token1Id)
    assert(pair != null)

    const token0 = await getToken(store, token0Id)
    const token1 = await getToken(store, token1Id)

    const price0 = token0.derivedETH.mul(bundle.ethPrice)
    const price1 = token1.derivedETH.mul(bundle.ethPrice)

    // both are whitelist tokens, take average of both amounts
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount0.mul(price0).plus(tokenAmount1).mul(price1)
    }

    // take double value of the whitelisted token amount
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
        return tokenAmount0.mul(price0).mul(2)
    }

    // take double value of the whitelisted token amount
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount1.mul(price1).mul(2)
    }

    return ZERO_BD
}
