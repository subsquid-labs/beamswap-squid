import { EvmLogHandlerContext, Store } from "@subsquid/substrate-evm-processor";
import { Bundle, Pair, Token, UniswapFactory } from "../model";
import {
  fetchTokenDecimals,
  fetchTokenName,
  fetchTokenSymbol,
  fetchTokenTotalSupply,
} from "./helpers";
import * as factoryAbi from "../types/abi/factory";
import { FACTORY_ADDRESS, knownContracts, ZERO_BD, ZERO_BI } from "../consts";

async function createToken(id: string): Promise<Token> {
  // fetch info if null
  const decimals = await fetchTokenDecimals(id);

  // bail if we couldn't figure out the decimals
  if (!decimals) {
    throw new Error(`Decimals for token ${id} not found`);
  }

  return new Token({
    id,
    symbol: await fetchTokenSymbol(id),
    name: await fetchTokenName(id),
    totalSupply: await fetchTokenTotalSupply(id),
    decimals,
    derivedETH: ZERO_BD,
    tradeVolume: ZERO_BD,
    tradeVolumeUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    totalLiquidity: ZERO_BD,
    // allPairs: [],
    txCount: ZERO_BI,
  });
}

async function getOrCreateToken(store: Store, id: string) {
  let token = await store.get(Token, id);
  if (!token) {
    token = await createToken(id);
    await store.save(token);
  }

  return token;
}

export async function handleNewPair(ctx: EvmLogHandlerContext): Promise<void> {
  const event =
    factoryAbi.events["PairCreated(address,address,address,uint256)"].decode(
      ctx
    );
  // load factory (create if first exchange)
  let factory = await ctx.store.get(UniswapFactory, FACTORY_ADDRESS);
  if (!factory) {
    factory = new UniswapFactory({
      id: FACTORY_ADDRESS,
      pairCount: 0,
      totalVolumeETH: ZERO_BD,
      totalLiquidityETH: ZERO_BD,
      totalVolumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      totalLiquidityUSD: ZERO_BD,
      txCount: ZERO_BI,
    });

    // create new bundle
    const bundle = new Bundle({
      id: "1",
      ethPrice: ZERO_BD,
    });
    await ctx.store.save(bundle);
  }
  factory.pairCount += 1;
  await ctx.store.save(factory);

  // create the tokens
  const token0 = await getOrCreateToken(ctx.store, event.token0);
  const token1 = await getOrCreateToken(ctx.store, event.token1);

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
  });
  await ctx.store.save(pair);

  // if (!knownContracts.indexOf(event.pair))
  //   throw new Error(`Unknown new pair contract address ${event.pair}`);
}
