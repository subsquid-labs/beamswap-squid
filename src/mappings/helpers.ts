import assert from 'assert'
import { Store } from '@subsquid/substrate-processor'
import { User, Bundle, Token, LiquidityPosition, LiquidityPositionSnapshot, Pair } from '../model'
import { getErc20Contract, getErc20NameBytesContract } from '../contract'
import { ZERO_BD, ZERO_BI } from '../consts'

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

// export function createLiquidityPosition(
//   exchange: Address,
//   user: Address
// ): LiquidityPosition {
//   let id = exchange.toHexString().concat("-").concat(user.toHexString());
//   let liquidityTokenBalance = LiquidityPosition.load(id);
//   if (liquidityTokenBalance === null) {
//     let pair = Pair.load(exchange.toHexString());
//     pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI);
//     liquidityTokenBalance = new LiquidityPosition(id);
//     liquidityTokenBalance.liquidityTokenBalance = ZERO_BD;
//     liquidityTokenBalance.pair = exchange.toHexString();
//     liquidityTokenBalance.user = user.toHexString();
//     liquidityTokenBalance.save();
//     pair.save();
//   }
//   if (liquidityTokenBalance === null)
//     log.error("LiquidityTokenBalance is null", [id]);
//   return liquidityTokenBalance as LiquidityPosition;
// }

export function createUser(address: string): User {
    return new User({
        id: address,
        usdSwapped: ZERO_BD,
        liquidityPositions: [],
    })
}

export async function getUser(store: Store, address: string): Promise<User> {
    let user = await store.get(User, address)
    if (!user) {
        user = createUser(address)
        await store.save(user)
    }

    return user
}

// export function createLiquiditySnapshot(
//   position: LiquidityPosition,
//   event: EthereumEvent
// ): void {
//   let timestamp = event.block.timestamp.toI32();
//   let bundle = Bundle.load("1");
//   let pair = Pair.load(position.pair);
//   let token0 = Token.load(pair.token0);
//   let token1 = Token.load(pair.token1);

//   // create new snapshot
//   let snapshot = new LiquidityPositionSnapshot(
//     position.id.concat(timestamp.toString())
//   );
//   snapshot.liquidityPosition = position.id;
//   snapshot.timestamp = timestamp;
//   snapshot.block = event.block.number.toI32();
//   snapshot.user = position.user;
//   snapshot.pair = position.pair;
//   snapshot.token0PriceUSD = token0.derivedETH.times(bundle.ethPrice);
//   snapshot.token1PriceUSD = token1.derivedETH.times(bundle.ethPrice);
//   snapshot.reserve0 = pair.reserve0;
//   snapshot.reserve1 = pair.reserve1;
//   snapshot.reserveUSD = pair.reserveUSD;
//   snapshot.liquidityTokenTotalSupply = pair.totalSupply;
//   snapshot.liquidityTokenBalance = position.liquidityTokenBalance;
//   snapshot.liquidityPosition = position.id;
//   snapshot.save();
//   position.save();
// }

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

export async function getToken(store: Store, address: string): Promise<Token> {
    let token = await store.get(Token, address)
    if (!token) {
        token = await createToken(address)
        await store.save(token)
    }

    return token
}
