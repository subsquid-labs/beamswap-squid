import assert from 'assert'
import { Store, SubstrateBlock } from '@subsquid/substrate-processor'
import { User, Bundle, Token, LiquidityPosition, LiquidityPositionSnapshot, Pair } from '../model'
import { getErc20Contract, getErc20NameBytesContract } from '../contract'
import { ONE_BI, ZERO_BD, ZERO_BI } from '../consts'
import { BigNumber } from 'ethers'

export function convertTokenToDecimal(amount: BigNumber, decimals: bigint): number {
    let divider = 1n
    for (let i = 0; i < decimals; i++) {
        divider *= 10n
    }
    return amount.div(divider).toNumber()
}

export async function fetchTokenSymbol(tokenAddress: string): Promise<string> {
    try {
        const contract = getErc20Contract(tokenAddress)
        const symbolResult = await contract.symbol()
        assert(typeof symbolResult === 'string')

        return symbolResult
    } catch (err) {
        const contractNameBytes = getErc20NameBytesContract(tokenAddress)
        const symbolResultBytes = await contractNameBytes.symbol()
        assert(Buffer.isBuffer(symbolResultBytes))

        return symbolResultBytes.toString('ascii')
    }
}

export async function fetchTokenName(tokenAddress: string): Promise<string> {
    try {
        const contract = getErc20Contract(tokenAddress)
        const nameResult = await contract.name()
        assert(typeof nameResult === 'string')

        return nameResult
    } catch (err) {
        const contractNameBytes = getErc20NameBytesContract(tokenAddress)
        const nameResultBytes = await contractNameBytes.name()
        assert(Buffer.isBuffer(nameResultBytes))

        return nameResultBytes.toString('ascii')
    }
}

export async function fetchTokenTotalSupply(tokenAddress: string): Promise<bigint> {
    const contract = getErc20Contract(tokenAddress)
    const totalSupplyResult = (await contract.totalSupply())?.toBigInt()
    assert(typeof totalSupplyResult === 'bigint')

    return totalSupplyResult
}

export async function fetchTokenDecimals(tokenAddress: string): Promise<bigint> {
    const contract = getErc20Contract(tokenAddress)
    const decimalsResult = await contract.decimals()
    assert(typeof decimalsResult === 'number')

    return BigInt(decimalsResult)
}

interface LiquidityPositionData {
    pair: Pair
    user: User
}

export function createLiquidityPosition(data: LiquidityPositionData): LiquidityPosition {
    const { pair, user } = data

    return new LiquidityPosition({
        id: `${pair.id}-${user.id}`,
        liquidityTokenBalance: ZERO_BD,
        pair,
        user,
    })
}

export function createUser(address: string): User {
    return new User({
        id: address,
        usdSwapped: ZERO_BD,
    })
}

interface LiquiditySnapshotData {
    position: LiquidityPosition
    block: SubstrateBlock
    bundle: Bundle
    pair: Pair
    user: User
}

export function createLiquiditySnapshot(data: LiquiditySnapshotData): LiquidityPositionSnapshot {
    const { position, block, bundle, pair, user } = data

    const token0 = pair.token0
    const token1 = pair.token1

    // create new snapshot
    const snapshot = new LiquidityPositionSnapshot({
        id: `${position.id}-${block.timestamp}`,
        liquidityPosition: position,
        timestamp: BigInt(block.timestamp),
        block: BigInt(block.height),
        user,
        pair,
        token0PriceUSD: token0.derivedETH * bundle.ethPrice,
        token1PriceUSD: token1.derivedETH * bundle.ethPrice,
        reserve0: pair.reserve0,
        reserve1: pair.reserve1,
        reserveUSD: pair.reserveUSD,
        liquidityTokenTotalSupply: pair.totalSupply,
        liquidityTokenBalance: position.liquidityTokenBalance,
    })

    return snapshot
}

export async function createToken(address: string): Promise<Token> {
    // fetch info if null
    const decimals = await fetchTokenDecimals(address)

    // bail if we couldn't figure out the decimals
    if (!decimals) {
        throw new Error(`Decimals for token ${address} not found`)
    }

    return new Token({
        id: address,
        symbol: await fetchTokenSymbol(address),
        name: await fetchTokenName(address),
        totalSupply: await fetchTokenTotalSupply(address),
        decimals,
        derivedETH: ZERO_BD,
        tradeVolume: ZERO_BD,
        tradeVolumeUSD: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalLiquidity: ZERO_BD,
        // allPairs: [],
        txCount: ZERO_BI,
    })
}
