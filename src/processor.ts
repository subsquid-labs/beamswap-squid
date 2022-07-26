import { BatchContext, EvmLogEvent, SubstrateBatchProcessor, SubstrateBlock } from '@subsquid/substrate-processor'
import * as factory from './types/abi/factory'
import * as pair from './types/abi/pair'
import { handleNewPair } from './mappings/factory'
import { CHAIN_NODE, FACTORY_ADDRESS } from './consts'
import { handleBurn, handleMint, handleSwap, handleSync, handleTransfer } from './mappings/core'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
// import { pairContracts } from './contract'
import { getAddress } from '@ethersproject/address'
import { saveAll } from './mappings/entityUtils'
import { Pair, Swap, Swapper, SwapperType } from './model'
import { SwapStat } from './model/custom/swapStat'
import { Between, Not, In } from 'typeorm'
import bigDecimal from 'js-big-decimal'

const PAIR_CREATED_TOPIC = factory.events['PairCreated(address,address,address,uint256)'].topic

const database = new TypeormDatabase()
const processor = new SubstrateBatchProcessor()
    .setBatchSize(100)
    .setBlockRange({ from: 199900 })
    .setDataSource({
        chain: CHAIN_NODE,
        archive: 'https://moonbeam.archive.subsquid.io/graphql',
    })
    .setTypesBundle('moonbeam')
    .addEvmLog(FACTORY_ADDRESS, {
        filter: [PAIR_CREATED_TOPIC],
    })

processor.addEvmLog('*', {
    filter: [
        [
            pair.events['Transfer(address,address,uint256)'].topic,
            pair.events['Sync(uint112,uint112)'].topic,
            pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic,
            pair.events['Mint(address,uint256,uint256)'].topic,
            pair.events['Burn(address,uint256,uint256,address)'].topic,
        ],
    ],
})

processor.run(database, async (ctx) => {
    for (const block of ctx.blocks) {
        for (const item of block.items) {
            if (item.kind === 'event') {
                if (item.name === 'EVM.Log') {
                    await handleEvmLog(ctx, block.header, item.event)
                }
            }
        }
    }

    await saveAll(ctx.store)

    const lastBlock = ctx.blocks[ctx.blocks.length - 1].header
    await updateTop(ctx, lastBlock)
})

const knownContracts: string[] = []

async function isPairContract(store: Store, address: string): Promise<boolean> {
    const normalizedAddress = getAddress(address)
    if (knownContracts.includes(normalizedAddress)) {
        return true
    } else if ((await store.countBy(Pair, { id: normalizedAddress })) > 0) {
        knownContracts.push(normalizedAddress)
        return true
    }

    return false
}

async function handleEvmLog(ctx: BatchContext<Store, unknown>, block: SubstrateBlock, event: EvmLogEvent) {
    const contractAddress = event.args.address
    if (contractAddress === FACTORY_ADDRESS && event.args.topics[0] === PAIR_CREATED_TOPIC) {
        await handleNewPair(ctx, block, event)
    } else if (await isPairContract(ctx.store, contractAddress)) {
        switch (event.args.topics[0]) {
            case pair.events['Transfer(address,address,uint256)'].topic:
                await handleTransfer(ctx, block, event)
                break
            case pair.events['Sync(uint112,uint112)'].topic:
                await handleSync(ctx, block, event)
                break
            case pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic:
                await handleSwap(ctx, block, event)
                break
            case pair.events['Mint(address,uint256,uint256)'].topic:
                await handleMint(ctx, block, event)
                break
            case pair.events['Burn(address,uint256,uint256,address)'].topic:
                await handleBurn(ctx, block, event)
                break
        }
    }
}

const HOUR_MS = 1000.0 * 60.0 * 60.0
const DAY_MS = HOUR_MS * 24.0
const WEEK_MS = DAY_MS * 7.0
const MONTH_MS = DAY_MS * 30.0

const topUpdateInterval = 60 * 60 * 1000
let lastUpdateTopTimestamp: number | undefined

async function updateTop(ctx: BatchContext<Store, unknown>, block: SubstrateBlock) {
    const swapStat = await ctx.store.findOneBy(SwapStat, { id: '0' })

    if (lastUpdateTopTimestamp == null) {
        lastUpdateTopTimestamp = swapStat?.timestamp.getTime() || -topUpdateInterval
    }

    if (block.timestamp < lastUpdateTopTimestamp + topUpdateInterval) return
    ctx.log.info('Updating top...')

    const swappers = new Map<string, Swapper>()

    const end = new Date(Math.floor(block.timestamp / HOUR_MS) * HOUR_MS)
    const start = new Date(end.getTime() - MONTH_MS)

    ctx.log.info(`month: ${start} - ${end}
    week: ${new Date(end.getTime() - WEEK_MS)} - ${end}
    day: ${new Date(end.getTime() - DAY_MS)} - ${end}
    `)

    const swaps = await ctx.store.find(Swap, {
        where: { timestamp: Between(start, end) },
    })

    const newSwapStat = new SwapStat({
        id: '0',
        daySwapsCount: 0,
        weekSwapsCount: 0,
        monthSwapsCount: 0,
        timestamp: end,
        totalAmountUSD: '0',
    })

    for await (const swap of swaps) {
        let user = swappers.get(swap.to)
        if (user == null) {
            user = new Swapper({
                id: swap.to,
                dayAmountUSD: '0',
                weekAmountUSD: '0',
                monthAmountUSD: '0',
                type: SwapperType.USER,
            })
            swappers.set(user.id, user)
        }

        let pair = swappers.get(swap.pairId!)
        if (pair == null) {
            pair = new Swapper({
                id: swap.pairId!,
                dayAmountUSD: '0',
                weekAmountUSD: '0',
                monthAmountUSD: '0',
                type: SwapperType.PAIR,
            })
            swappers.set(pair.id, pair)
        }

        if (swap.timestamp.getTime() >= end.getTime() - DAY_MS) {
            user.dayAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.dayAmountUSD)
            pair.dayAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.dayAmountUSD)
            newSwapStat.daySwapsCount += 1
        }

        if (swap.timestamp.getTime() >= end.getTime() - WEEK_MS) {
            user.weekAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.weekAmountUSD)
            pair.weekAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.weekAmountUSD)
            newSwapStat.weekSwapsCount += 1
        }

        if (swap.timestamp.getTime() >= end.getTime() - MONTH_MS) {
            user.monthAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.monthAmountUSD)
            pair.monthAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.monthAmountUSD)
            newSwapStat.monthSwapsCount += 1
        }

        newSwapStat.totalAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), newSwapStat.totalAmountUSD)
    }

    lastUpdateTopTimestamp = block.timestamp

    const swappersArray = [...swappers.values()]

    const { dayPairsCount, weekPairsCount, monthPairsCount } = swappersArray.reduce(
        (res, s) => {
            if (s.type === SwapperType.PAIR) {
                if (bigDecimal.compareTo(s.dayAmountUSD, 0) > 0) res.dayPairsCount += 1
                if (bigDecimal.compareTo(s.weekAmountUSD, 0) > 0) res.weekPairsCount += 1
                if (bigDecimal.compareTo(s.monthAmountUSD, 0) > 0) res.monthPairsCount += 1
            }

            return res
        },
        { dayPairsCount: 0, weekPairsCount: 0, monthPairsCount: 0 }
    )

    const { dayUsersCount, weekUsersCount, monthUsersCount } = swappersArray.reduce(
        (res, s) => {
            if (s.type === SwapperType.USER) {
                if (bigDecimal.compareTo(s.dayAmountUSD, 0) > 0) res.dayUsersCount += 1
                if (bigDecimal.compareTo(s.weekAmountUSD, 0) > 0) res.weekUsersCount += 1
                if (bigDecimal.compareTo(s.monthAmountUSD, 0) > 0) res.monthUsersCount += 1
            }

            return res
        },
        { dayUsersCount: 0, weekUsersCount: 0, monthUsersCount: 0 }
    )

    newSwapStat.dayPairsCount = dayPairsCount
    newSwapStat.weekPairsCount = weekPairsCount
    newSwapStat.monthPairsCount = monthPairsCount

    newSwapStat.dayUsersCount = dayUsersCount
    newSwapStat.weekUsersCount = weekUsersCount
    newSwapStat.monthUsersCount = monthUsersCount

    await ctx.store.save(newSwapStat)
    await ctx.store.remove(await ctx.store.findBy(Swapper, { id: Not(In([...swappers.keys()])) }))
    await ctx.store.save(swappersArray)

    ctx.log.info('Top updated.')
}
