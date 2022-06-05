import { Pair, Token, Bundle } from '../model'
import { ZERO_BD, ONE_BD, ADDRESS_ZERO } from '../consts'
import { Store } from '@subsquid/substrate-processor'
import assert from 'assert'
import { getFactoryContract } from '../contract'

const WGLMR_ADDRESS = '0x9dcca533798aae4ec78cfeb057cb7745dcde3048' //Replace with wrapped glint
const WGLMR_USDC_ADDRESS = '0x0230937449e9aa94662098a4a751af97c23a8797' //replace with wglint usdc LP address
const USDC = '0x65c281140d15184de571333387bfcc5e8fc7c8dc' // replace with USDC address

const WHITELIST: string[] = [
    '0xc81439cf140caeae699aa52d6e0fb61de3dc2680', //GLINT
    '0x9dcca533798aae4ec78cfeb057cb7745dcde3048', //WGLINT
    '0x65c281140d15184de571333387bfcc5e8fc7c8dc', //USDC
]

export async function getEthPriceInUSD(store: Store): Promise<number> {
    const usdcPair = await store.findOne(Pair, WGLMR_USDC_ADDRESS, {
        relations: ['token0', 'token1'],
    })
    assert(usdcPair != null)

    console.log(`usdcPair ${usdcPair.token0Price}, ${usdcPair.token1Price}`)
    const isUsdcFirst = usdcPair.token0.id === USDC
    return isUsdcFirst ? usdcPair.token0Price : usdcPair.token1Price
}

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
const MINIMUM_USD_THRESHOLD_NEW_PAIRS = 3000

// minimum liquidity for price to get tracked
const MINIMUM_LIQUIDITY_THRESHOLD_ETH = 5

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export async function findEthPerToken(store: Store, token: Token): Promise<number> {
    if (token.id === WGLMR_ADDRESS) {
        return ONE_BD
    }
    // loop through whitelist and check if paired with any
    for (let i = 0; i < WHITELIST.length; ++i) {
        const pairAddress = getFactoryContract().getPair(token.id, WHITELIST[i])
        assert(typeof pairAddress === 'string')
        if (pairAddress !== ADDRESS_ZERO) {
            const pair = await store.findOne(Pair, pairAddress, {
                relations: ['token0', 'token1'],
            })
            assert(pair != null, pairAddress)
            if (pair.token0.id === token.id && pair.reserveETH > MINIMUM_LIQUIDITY_THRESHOLD_ETH) {
                return pair.token1Price * pair.token1.derivedETH // return token1 per our token * Eth per token 1
            }
            if (pair.token1.id === token.id && pair.reserveETH > MINIMUM_LIQUIDITY_THRESHOLD_ETH) {
                return pair.token0Price * pair.token0.derivedETH // return token0 per our token * ETH per token 0
            }
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
    tokenAmount0: number,
    token0: Token,
    tokenAmount1: number,
    token1: Token,
    pair: Pair
): Promise<number> {
    const bundle = await store.findOne(Bundle, '1')
    assert(bundle)

    const price0 = token0.derivedETH * bundle.ethPrice
    const price1 = token1.derivedETH * bundle.ethPrice

    // if less than 5 LPs, require high minimum reserve amount amount or return 0
    if (pair.liquidityProviderCount < 5n) {
        const reserve0USD = pair.reserve0 * price0
        const reserve1USD = pair.reserve1 * price1
        if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            if (reserve0USD + reserve1USD < MINIMUM_USD_THRESHOLD_NEW_PAIRS) {
                return ZERO_BD
            }
        }
        if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
            if (reserve0USD * 2 < MINIMUM_USD_THRESHOLD_NEW_PAIRS) {
                return ZERO_BD
            }
        }
        if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
            if (reserve1USD * 2 < MINIMUM_USD_THRESHOLD_NEW_PAIRS) {
                return ZERO_BD
            }
        }
    }

    // both are whitelist tokens, take average of both amounts
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return (tokenAmount0 * price0 + tokenAmount1 * price1) / 2
    }

    // take full value of the whitelisted token amount
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
        return tokenAmount0 * price0
    }

    // take full value of the whitelisted token amount
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount1 * price1
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
    tokenAmount0: number,
    token0: Token,
    tokenAmount1: number,
    token1: Token
): Promise<number> {
    const bundle = await store.findOne(Bundle, '1')
    assert(bundle)

    const price0 = token0.derivedETH * bundle.ethPrice
    const price1 = token1.derivedETH * bundle.ethPrice

    // both are whitelist tokens, take average of both amounts
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount0 * price0 + tokenAmount1 * price1
    }

    // take double value of the whitelisted token amount
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
        return tokenAmount0 * price0 * 2
    }

    // take double value of the whitelisted token amount
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
        return tokenAmount1 * price1 * 2
    }

    return ZERO_BD
}
