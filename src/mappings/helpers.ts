import assert from 'assert'
import { User, Token, LiquidityPosition, Pair } from '../model'
import { createErc20Contract, createErc20NameBytesContract, createErc20SymbolBytesContract } from '../contract'
import { Contract, providers } from 'ethers'
import { addTimeout } from '@subsquid/util-timeout'
import bigDecimal from 'js-big-decimal'
import { CHAIN_NODE } from '../consts'

export function convertTokenToDecimal(amount: bigint, decimals: number): bigDecimal {
    return new bigDecimal(bigDecimal.divide(amount.toString(), Math.pow(10, decimals).toString(), decimals))
}

async function fetchTokenSymbol(contract: Contract, contractSympolBytes: Contract): Promise<string> {
    try {
        const symbolResult = await contract.symbol()
        assert(typeof symbolResult === 'string')

        return symbolResult
    } catch (err) {
        const symbolResultBytes = await contractSympolBytes.symbol()
        assert(Buffer.isBuffer(symbolResultBytes))

        return symbolResultBytes.toString('ascii')
    }
}

async function fetchTokenName(contract: Contract, contractNameBytes: Contract): Promise<string> {
    try {
        const nameResult = await contract.name()
        assert(typeof nameResult === 'string')

        return nameResult
    } catch (err) {
        const nameResultBytes = await contractNameBytes.name()
        assert(Buffer.isBuffer(nameResultBytes))

        return nameResultBytes.toString('ascii')
    }
}

async function fetchTokenTotalSupply(contract: Contract): Promise<bigint> {
    const totalSupplyResult = (await contract.totalSupply())?.toBigInt()
    assert(typeof totalSupplyResult === 'bigint')

    return totalSupplyResult
}

async function fetchTokenDecimals(contract: Contract): Promise<number> {
    const decimalsResult = await contract.decimals()
    assert(typeof decimalsResult === 'number')

    return decimalsResult
}

interface LiquidityPositionData {
    pair: Pair
    user: User
}

export function createLiquidityPosition(data: LiquidityPositionData): LiquidityPosition {
    const { pair, user } = data

    return new LiquidityPosition({
        id: `${pair.id}-${user.id}`,
        liquidityTokenBalance: new bigDecimal(0),
        pair,
        user,
    })
}

export function createUser(address: string): User {
    return new User({
        id: address,
        usdSwapped: new bigDecimal(0),
    })
}

// interface LiquiditySnapshotData {
//     position: LiquidityPosition
//     block: SubstrateBlock
//     bundle: Bundle
//     pair: Pair
//     user: User
// }

// export function createLiquiditySnapshot(data: LiquiditySnapshotData): LiquidityPositionSnapshot {
//     const { position, block, bundle, pair, user } = data

//     const token0 = pair.token0
//     const token1 = pair.token1

//     // create new snapshot
//     const snapshot = new LiquidityPositionSnapshot({
//         id: `${position.id}-${block.timestamp}`,
//         liquidityPosition: position,
//         timestamp: new Date(block.timestamp),
//         block: BigInt(block.height),
//         user,
//         pair,
//         token0PriceUSD: token0.derivedETH * bundle.ethPrice,
//         token1PriceUSD: token1.derivedETH * bundle.ethPrice,
//         reserve0: pair.reserve0,
//         reserve1: pair.reserve1,
//         reserveUSD: pair.reserveUSD,
//         liquidityTokenTotalSupply: pair.totalSupply,
//         liquidityTokenBalance: position.liquidityTokenBalance,
//     })

//     return snapshot
// }

export async function createToken(address: string): Promise<Token> {
    const provider = new providers.WebSocketProvider(CHAIN_NODE)
    const contract = createErc20Contract(address).connect(provider)
    const contractNameBytes = createErc20NameBytesContract(address).connect(provider)
    const contractSympolBytes = createErc20SymbolBytesContract(address).connect(provider)

    const symbol = await addTimeout(fetchTokenSymbol(contract, contractSympolBytes), 30)
    const name = await addTimeout(fetchTokenName(contract, contractNameBytes), 30)
    const totalSupply = await addTimeout(fetchTokenTotalSupply(contract), 30)
    const decimals = await addTimeout(fetchTokenDecimals(contract), 30)

    // bail if we couldn't figure out the decimals
    if (!decimals) {
        throw new Error(`Decimals for token ${address} not found`)
    }

    return new Token({
        id: address,
        symbol,
        name,
        totalSupply: convertTokenToDecimal(totalSupply, decimals),
        decimals,
        derivedETH: new bigDecimal(0),
        tradeVolume: new bigDecimal(0),
        tradeVolumeUSD: new bigDecimal(0),
        untrackedVolumeUSD: new bigDecimal(0),
        totalLiquidity: new bigDecimal(0),
        // allPairs: [],
        txCount: 0,
    })
}
