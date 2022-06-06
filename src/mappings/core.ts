import { EvmLogHandlerContext, Store, SubstrateBlock } from '@subsquid/substrate-evm-processor'
import { ADDRESS_ZERO, FACTORY_ADDRESS, BI_18, ZERO_BD, ONE_BI } from '../consts'
import {
    Pair,
    Token,
    UniswapFactory,
    Transaction,
    Mint as MintEvent,
    Burn as BurnEvent,
    Swap as SwapEvent,
    Bundle,
    Mint,
    Burn,
    User,
    LiquidityPosition,
} from '../model'
// import { updatePairDayData, updateTokenDayData, updateUniswapDayData, updatePairHourData } from './dayUpdates'
import { getEthPriceInUSD, findEthPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD } from './pricing'
import * as pairAbi from '../types/abi/pair'
import { BigNumber } from 'ethers'
import { convertTokenToDecimal, createLiquidityPosition, createLiquiditySnapshot, createUser } from './helpers'
import assert from 'assert'
import { getPairContract } from '../contract'
import { getAddress } from 'ethers/lib/utils'

async function isMintComplete(store: Store, mintId: string): Promise<boolean> {
    return (await store.get(Mint, mintId))?.sender != null // sufficient checks
}

export async function handleTransfer(ctx: EvmLogHandlerContext): Promise<void> {
    const contractAddress = getAddress(ctx.contractAddress)

    const event = pairAbi.events['Transfer(address,address,uint256)'].decode(ctx)
    // ignore initial transfers for first adds
    if (event.to === ADDRESS_ZERO && event.value === BigNumber.from(1000)) {
        return
    }

    const transactionHash = ctx.txHash

    // user stats
    const from = await getUser(ctx.store, event.from)
    const to = await getUser(ctx.store, event.to)

    // get pair and load contract
    const pair = await ctx.store.findOne(Pair, contractAddress, {
        relations: ['token0', 'token1'],
    })
    assert(pair != null, contractAddress)

    // let pairContract = PairContract.bind(event.address)

    // liquidity token amount being transfered
    const value = convertTokenToDecimal(event.value, 18n)

    // get or create transaction
    let transaction = await ctx.store.get(Transaction, transactionHash)
    if (!transaction) {
        transaction = new Transaction({
            id: transactionHash,
            blockNumber: BigInt(ctx.substrate.block.height),
            timestamp: BigInt(ctx.substrate.block.timestamp),
            mints: [],
            burns: [],
            swaps: [],
        })
        await ctx.store.save(transaction)
    }

    // mints
    if (from.id === ADDRESS_ZERO) {
        const mintsLength = transaction.mints.length
        // update total supply
        pair.totalSupply += value
        await ctx.store.save(pair)

        // create new mint if no mints so far or if last one is done already
        const isLastComplete =
            mintsLength > 0 ? await isMintComplete(ctx.store, transaction.mints[mintsLength - 1]) : false
        if (mintsLength === 0 || isLastComplete) {
            const mint = new MintEvent({
                id: `${ctx.txHash}-${mintsLength}`,
                transaction,
                pair,
                to: to.id,
                liquidity: value,
                timestamp: transaction.timestamp,
            })
            await ctx.store.save(mint)

            // update mints in transaction
            transaction.mints.push(mint.id)
        }
    }

    // case where direct send first on ETH withdrawls
    if (to.id === pair.id) {
        const burnsLength = transaction.burns.length

        const burn = new BurnEvent({
            id: `${ctx.txHash}-${burnsLength}`,
            transaction,
            pair,
            liquidity: value,
            timestamp: transaction.timestamp,
            to: to.id,
            sender: from.id,
            needsComplete: true,
        })

        await ctx.store.save(burn)

        // TODO: Consider using .concat() for handling array updates to protect
        // against unintended side effects for other code paths.
        transaction.burns.push(burn.id)
    }

    // burn
    if (to.id == ADDRESS_ZERO && from.id == pair.id) {
        pair.totalSupply -= value
        await ctx.store.save(pair)

        // this is a new instance of a logical burn
        const burnsLength = transaction.burns.length

        const currentBurn = await ctx.store.get(Burn, transaction.burns[burnsLength - 1])

        const burn = currentBurn?.needsComplete
            ? currentBurn
            : new BurnEvent({
                  id: `${ctx.txHash}-${burnsLength}`,
                  transaction,
                  pair,
                  needsComplete: false,
                  liquidity: value,
                  timestamp: transaction.timestamp,
              })

        const mintsLength = transaction.mints.length
        const isLastComplete =
            mintsLength > 0 ? await isMintComplete(ctx.store, transaction.mints[mintsLength - 1]) : false
        // if this logical burn included a fee mint, account for this
        if (!isLastComplete) {
            const mint = await ctx.store.get(Mint, transaction.mints[mintsLength - 1])
            assert(mint != null)

            burn.feeTo = mint.to
            burn.feeLiquidity = mint.liquidity
            // remove the logical mint
            await ctx.store.remove('Mint', mint)
            // update the transaction

            // TODO: Consider using .slice().pop() to protect against unintended
            // side effects for other code paths.
            transaction.mints.pop()
        }
        await ctx.store.save(burn)

        // if accessing last one, replace it
        if (burn.needsComplete) transaction.burns.pop()

        transaction.burns.push(burn.id)
    }

    const bundle = await ctx.store.get(Bundle, '1')
    assert(bundle != null)

    if (from.id !== ADDRESS_ZERO && from.id !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pair, user: from, block: ctx.substrate.block, bundle })
    }

    if (to.id !== ADDRESS_ZERO && to.id !== pair.id) {
        await updateLiquidityPositionForAddress(ctx.store, { pair, user: to, block: ctx.substrate.block, bundle })
    }

    await ctx.store.save(transaction)
}

async function getUser(store: Store, address: string) {
    let user = await store.findOne(User, address)
    if (!user) {
        user = createUser(address)
        await store.save(user)
    }

    return user
}

async function updateLiquidityPositionForAddress(
    store: Store,
    data: { pair: Pair; user: User; block: SubstrateBlock; bundle: Bundle }
) {
    const { pair, user, block, bundle } = data

    let position = await store.findOne(LiquidityPosition, `${pair.id}-${user.id}`)
    if (!position) {
        position = createLiquidityPosition({
            pair,
            user,
        })

        pair.liquidityProviderCount += 1n
        await store.save(pair)
    }

    const balance: BigNumber = await getPairContract(pair.id).balanceOf(user.id)
    position.liquidityTokenBalance = convertTokenToDecimal(balance, 18n)
    await store.save(position)

    await store.save(
        createLiquiditySnapshot({
            position,
            block,
            bundle,
            pair,
            user,
        })
    )
}

export async function handleSync(ctx: EvmLogHandlerContext): Promise<void> {
    const contractAddress = getAddress(ctx.contractAddress)

    const event = pairAbi.events['Sync(uint112,uint112)'].decode(ctx)

    const bundle = await ctx.store.findOne(Bundle, '1')
    assert(bundle != null)

    const pair = await ctx.store.findOne(Pair, contractAddress, {
        relations: ['token0', 'token1'],
    })
    assert(pair != null, contractAddress)

    const uniswap = await ctx.store.findOne(UniswapFactory, getAddress(FACTORY_ADDRESS))
    assert(uniswap != null, FACTORY_ADDRESS)

    const token0 = pair.token0
    const token1 = pair.token1

    // reset factory liquidity by subtracting onluy tarcked liquidity
    uniswap.totalLiquidityETH -= pair.trackedReserveETH

    // reset token total liquidity amounts
    token0.totalLiquidity -= pair.reserve0
    token1.totalLiquidity -= pair.reserve1

    pair.reserve0 = convertTokenToDecimal(event.reserve0, token0.decimals)
    pair.reserve1 = convertTokenToDecimal(event.reserve1, token1.decimals)

    pair.token0Price = pair.reserve1 !== ZERO_BD ? pair.token0Price / pair.reserve1 : ZERO_BD
    pair.token1Price = pair.reserve0 !== ZERO_BD ? pair.token1Price / pair.reserve0 : ZERO_BD

    // update ETH price now that reserves could have changed

    bundle.ethPrice = await getEthPriceInUSD(ctx.store)

    token0.derivedETH = await findEthPerToken(ctx.store, token0)
    token1.derivedETH = await findEthPerToken(ctx.store, token1)

    // get tracked liquidity - will be 0 if neither is in whitelist
    const trackedLiquidityETH =
        bundle.ethPrice !== ZERO_BD
            ? (await getTrackedLiquidityUSD(ctx.store, pair.reserve0, token0, pair.reserve1, token1)) / bundle.ethPrice
            : ZERO_BD

    // use derived amounts within pair
    pair.trackedReserveETH = trackedLiquidityETH
    pair.reserveETH = pair.reserve0 * token0.derivedETH + pair.reserve1 * token1.derivedETH
    pair.reserveUSD = pair.reserveETH * bundle.ethPrice

    // use tracked amounts globally
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH + trackedLiquidityETH
    uniswap.totalLiquidityUSD = uniswap.totalLiquidityETH + bundle.ethPrice

    // now correctly set liquidity amounts for each token
    token0.totalLiquidity = token0.totalLiquidity + pair.reserve0
    token1.totalLiquidity = token1.totalLiquidity + pair.reserve1

    // save entities
    await ctx.store.save([pair, token0, token1, bundle, uniswap])
}

export async function handleMint(ctx: EvmLogHandlerContext): Promise<void> {
    const contractAddress = getAddress(ctx.contractAddress)

    const event = pairAbi.events['Mint(address,uint256,uint256)'].decode(ctx)

    const transaction = await ctx.store.findOne(Transaction, ctx.txHash)
    assert(transaction != null, ctx.txHash)

    const mintsLength = transaction.mints.length
    const mint = await ctx.store.findOne(MintEvent, transaction.mints[mintsLength - 1])
    assert(mint != null, transaction.mints[mintsLength - 1])

    const pair = await ctx.store.findOne(Pair, contractAddress, {
        relations: ['token0', 'token1'],
    })
    assert(pair != null, contractAddress)

    const uniswap = await ctx.store.findOne(UniswapFactory, getAddress(FACTORY_ADDRESS))
    assert(uniswap != null)

    const token0 = pair.token0
    const token1 = pair.token1

    // update exchange info (except balances, sync will cover that)
    const token0Amount = convertTokenToDecimal(event.amount0, token0.decimals)
    const token1Amount = convertTokenToDecimal(event.amount1, token1.decimals)

    // update txn counts
    token0.txCount = token0.txCount + ONE_BI
    token1.txCount = token1.txCount + ONE_BI

    // get new amounts of USD and ETH for tracking
    const bundle = await ctx.store.findOne(Bundle, '1')
    assert(bundle != null)

    const amountTotalUSD = (token1.derivedETH * token1Amount + token0.derivedETH * token0Amount) * bundle.ethPrice

    // update txn counts
    pair.txCount = pair.txCount + ONE_BI
    uniswap.txCount = uniswap.txCount + ONE_BI

    // save entities
    await ctx.store.save([token0, token1, pair, uniswap])

    mint.sender = event.sender
    mint.amount0 = token0Amount
    mint.amount1 = token1Amount
    mint.logIndex = 0n //logIndex
    mint.amountUSD = amountTotalUSD

    await ctx.store.save(mint)

    const user = await getUser(ctx.store, mint.to)
    // update the LP position
    await updateLiquidityPositionForAddress(ctx.store, { pair, user, block: ctx.substrate.block, bundle })

    // update day entities
    updatePairDayData(event)
    updatePairHourData(event)
    updateUniswapDayData(event)
    updateTokenDayData(token0 as Token, event)
    updateTokenDayData(token1 as Token, event)
}

// export function handleBurn(event: Burn): void {
//     let transaction = Transaction.load(event.transaction.hash.toHexString())

//     // safety check
//     if (transaction === null) {
//         return
//     }

//     let burns = transaction.burns
//     let burn = BurnEvent.load(burns[burns.length - 1])

//     let pair = Pair.load(event.address.toHex())
//     let uniswap = UniswapFactory.load(FACTORY_ADDRESS)

//     //update token info
//     let token0 = Token.load(pair.token0)
//     let token1 = Token.load(pair.token1)
//     let token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals)
//     let token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals)

//     // update txn counts
//     token0.txCount = token0.txCount.plus(ONE_BI)
//     token1.txCount = token1.txCount.plus(ONE_BI)

//     // get new amounts of USD and ETH for tracking
//     let bundle = Bundle.load('1')
//     let amountTotalUSD = token1.derivedETH
//         .times(token1Amount)
//         .plus(token0.derivedETH.times(token0Amount))
//         .times(bundle.ethPrice)

//     // update txn counts
//     uniswap.txCount = uniswap.txCount.plus(ONE_BI)
//     pair.txCount = pair.txCount.plus(ONE_BI)

//     // update global counter and save
//     token0.save()
//     token1.save()
//     pair.save()
//     uniswap.save()

//     // update burn
//     // burn.sender = event.params.sender
//     burn.amount0 = token0Amount as BigDecimal
//     burn.amount1 = token1Amount as BigDecimal
//     // burn.to = event.params.to
//     burn.logIndex = event.logIndex
//     burn.amountUSD = amountTotalUSD as BigDecimal
//     burn.save()

//     // update the LP position
//     let liquidityPosition = createLiquidityPosition(event.address, burn.sender as Address)
//     createLiquiditySnapshot(liquidityPosition, event)

//     // update day entities
//     updatePairDayData(event)
//     updatePairHourData(event)
//     updateUniswapDayData(event)
//     updateTokenDayData(token0 as Token, event)
//     updateTokenDayData(token1 as Token, event)
// }

// export function handleSwap(event: Swap): void {
//     let pair = Pair.load(event.address.toHexString())
//     let token0 = Token.load(pair.token0)
//     let token1 = Token.load(pair.token1)
//     let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals)
//     let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals)
//     let amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals)
//     let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

//     // totals for volume updates
//     let amount0Total = amount0Out.plus(amount0In)
//     let amount1Total = amount1Out.plus(amount1In)

//     // ETH/USD prices
//     let bundle = Bundle.load('1')

//     // get total amounts of derived USD and ETH for tracking
//     let derivedAmountETH = token1.derivedETH
//         .times(amount1Total)
//         .plus(token0.derivedETH.times(amount0Total))
//         .div(BigDecimal.fromString('2'))
//     let derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)

//     // only accounts for volume through white listed tokens
//     let trackedAmountUSD = getTrackedVolumeUSD(
//         amount0Total,
//         token0 as Token,
//         amount1Total,
//         token1 as Token,
//         pair as Pair
//     )

//     let trackedAmountETH: BigDecimal
//     if (bundle.ethPrice.equals(ZERO_BD)) {
//         trackedAmountETH = ZERO_BD
//     } else {
//         trackedAmountETH = trackedAmountUSD.div(bundle.ethPrice)
//     }

//     // update token0 global volume and token liquidity stats
//     token0.tradeVolume = token0.tradeVolume.plus(amount0In.plus(amount0Out))
//     token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD)
//     token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD)

//     // update token1 global volume and token liquidity stats
//     token1.tradeVolume = token1.tradeVolume.plus(amount1In.plus(amount1Out))
//     token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD)
//     token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD)

//     // update txn counts
//     token0.txCount = token0.txCount.plus(ONE_BI)
//     token1.txCount = token1.txCount.plus(ONE_BI)

//     // update pair volume data, use tracked amount if we have it as its probably more accurate
//     pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
//     pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
//     pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
//     pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
//     pair.txCount = pair.txCount.plus(ONE_BI)
//     pair.save()

//     // update global values, only used tracked amounts for volume
//     let uniswap = UniswapFactory.load(FACTORY_ADDRESS)
//     uniswap.totalVolumeUSD = uniswap.totalVolumeUSD.plus(trackedAmountUSD)
//     uniswap.totalVolumeETH = uniswap.totalVolumeETH.plus(trackedAmountETH)
//     uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.plus(derivedAmountUSD)
//     uniswap.txCount = uniswap.txCount.plus(ONE_BI)

//     // save entities
//     pair.save()
//     token0.save()
//     token1.save()
//     uniswap.save()

//     let transaction = Transaction.load(event.transaction.hash.toHexString())
//     if (transaction === null) {
//         transaction = new Transaction(event.transaction.hash.toHexString())
//         transaction.blockNumber = event.block.number
//         transaction.timestamp = event.block.timestamp
//         transaction.mints = []
//         transaction.swaps = []
//         transaction.burns = []
//     }
//     let swaps = transaction.swaps
//     let swap = new SwapEvent(
//         event.transaction.hash.toHexString().concat('-').concat(BigInt.fromI32(swaps.length).toString())
//     )

//     // update swap event
//     swap.transaction = transaction.id
//     swap.pair = pair.id
//     swap.timestamp = transaction.timestamp
//     swap.transaction = transaction.id
//     swap.sender = event.params.sender
//     swap.amount0In = amount0In
//     swap.amount1In = amount1In
//     swap.amount0Out = amount0Out
//     swap.amount1Out = amount1Out
//     swap.to = event.params.to
//     swap.from = event.transaction.from
//     swap.logIndex = event.logIndex
//     // use the tracked amount if we have it
//     swap.amountUSD = trackedAmountUSD === ZERO_BD ? derivedAmountUSD : trackedAmountUSD
//     swap.save()

//     // update the transaction

//     // TODO: Consider using .concat() for handling array updates to protect
//     // against unintended side effects for other code paths.
//     swaps.push(swap.id)
//     transaction.swaps = swaps
//     transaction.save()

//     // update day entities
//     let pairDayData = updatePairDayData(event)
//     let pairHourData = updatePairHourData(event)
//     let uniswapDayData = updateUniswapDayData(event)
//     let token0DayData = updateTokenDayData(token0 as Token, event)
//     let token1DayData = updateTokenDayData(token1 as Token, event)

//     // swap specific updating
//     uniswapDayData.dailyVolumeUSD = uniswapDayData.dailyVolumeUSD.plus(trackedAmountUSD)
//     uniswapDayData.dailyVolumeETH = uniswapDayData.dailyVolumeETH.plus(trackedAmountETH)
//     uniswapDayData.dailyVolumeUntracked = uniswapDayData.dailyVolumeUntracked.plus(derivedAmountUSD)
//     uniswapDayData.save()

//     // swap specific updating for pair
//     pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total)
//     pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total)
//     pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD)
//     pairDayData.save()

//     // update hourly pair data
//     pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total)
//     pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total)
//     pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD)
//     pairHourData.save()

//     // swap specific updating for token0
//     token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total)
//     token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(
//         amount0Total.times(token0.derivedETH as BigDecimal)
//     )
//     token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
//         amount0Total.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
//     )
//     token0DayData.save()

//     // swap specific updating
//     token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total)
//     token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(
//         amount1Total.times(token1.derivedETH as BigDecimal)
//     )
//     token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
//         amount1Total.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
//     )
//     token1DayData.save()
// }
