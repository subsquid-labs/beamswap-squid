import { BatchContext, EvmLogEvent, SubstrateBatchProcessor, SubstrateBlock } from '@subsquid/substrate-processor'
import * as factory from './types/abi/factory'
import * as pair from './types/abi/pair'
import { handleNewPair } from './mappings/factory'
import { CHAIN_NODE, DAY_MS, FACTORY_ADDRESS, HOUR_MS, MONTH_MS, WEEK_MS } from './consts'
import { handleBurn, handleMint, handleSwap, handleSync, handleTransfer } from './mappings/core'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
// import { pairContracts } from './contract'
import { getAddress } from '@ethersproject/address'
import { saveAll } from './mappings/entityUtils'
import { Pair, Swap, Swapper, SwapperType } from './model'
import { SwapStatPeriod, SwapPeriod } from './model/custom/swapStat'
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



const topUpdateInterval = 60 * 60 * 1000
let lastUpdateTopTimestamp: number | undefined

async function updateTop(ctx: BatchContext<Store, unknown>, block: SubstrateBlock) {
    const swapStat = await ctx.store.findOneBy(SwapStatPeriod, { id: '0' })

    if (lastUpdateTopTimestamp == null) {
        lastUpdateTopTimestamp = swapStat?.to.getTime() || -topUpdateInterval
    }

    if (block.timestamp < lastUpdateTopTimestamp + topUpdateInterval) return
    ctx.log.info('Updating top...')

    const swappers = new Map<string, Swapper>()

    const end = Math.floor(block.timestamp / HOUR_MS) * HOUR_MS

    const newSwapStat: Record<SwapPeriod, SwapStatPeriod> = {
        [SwapPeriod.DAY]: createSwapStat(SwapPeriod.DAY, end - DAY_MS, end),
        [SwapPeriod.WEEK]: createSwapStat(SwapPeriod.DAY, Math.floor((end - WEEK_MS) / DAY_MS) * DAY_MS, end),
        [SwapPeriod.MONTH]: createSwapStat(SwapPeriod.DAY, Math.floor((end - MONTH_MS) / DAY_MS) * DAY_MS, end)
    }

    const start = Math.max(...Object.values(newSwapStat).map(s => s.from.getTime()))

    const swaps = await ctx.store.find(Swap, {
        where: { timestamp: Between(new Date(start), new Date(end)) },
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

        if (swap.timestamp.getTime() >= end - DAY_MS) {
            user.dayAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.dayAmountUSD)
            pair.dayAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.dayAmountUSD)
            updateSwapStat(newSwapStat[SwapPeriod.DAY], swap.amountUSD)
        }

        if (swap.timestamp.getTime() >= end - WEEK_MS) {
            user.weekAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.weekAmountUSD)
            pair.weekAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.weekAmountUSD)
            updateSwapStat(newSwapStat[SwapPeriod.WEEK], swap.amountUSD)
        }

        if (swap.timestamp.getTime() >= end - MONTH_MS) {
            user.monthAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), user.monthAmountUSD)
            pair.monthAmountUSD = bigDecimal.add(swap.amountUSD.getValue(), pair.monthAmountUSD)
            updateSwapStat(newSwapStat[SwapPeriod.MONTH], swap.amountUSD)
        }
    }

    for (const swapper of swappers.values()) {
        if (swapper.type === SwapperType.PAIR) {
            if (bigDecimal.compareTo(swapper.dayAmountUSD, 0) > 0) newSwapStat[SwapPeriod.DAY].pairsCount += 1
            if (bigDecimal.compareTo(swapper.weekAmountUSD, 0) > 0) newSwapStat[SwapPeriod.WEEK].pairsCount += 1
            if (bigDecimal.compareTo(swapper.monthAmountUSD, 0) > 0) newSwapStat[SwapPeriod.MONTH].pairsCount += 1
        } else {
            if (bigDecimal.compareTo(swapper.dayAmountUSD, 0) > 0) newSwapStat[SwapPeriod.DAY].usersCount += 1
            if (bigDecimal.compareTo(swapper.weekAmountUSD, 0) > 0) newSwapStat[SwapPeriod.WEEK].usersCount += 1
            if (bigDecimal.compareTo(swapper.monthAmountUSD, 0) > 0) newSwapStat[SwapPeriod.MONTH].usersCount += 1
        }
    }

    await ctx.store.save(Object.values(newSwapStat))
    await ctx.store.remove(await ctx.store.findBy(Swapper, { id: Not(In([...swappers.keys()])) }))
    await ctx.store.save([...swappers.values()])

    lastUpdateTopTimestamp = block.timestamp

    ctx.log.info('Top updated.')
}

function updateSwapStat(swapStat: SwapStatPeriod, amountUSD: bigDecimal) {
    swapStat.swapsCount += 1
    swapStat.totalAmountUSD = bigDecimal.add(amountUSD.getValue(), swapStat.totalAmountUSD)
}

function createSwapStat(id: SwapPeriod, from: number, to: number) {
    return new SwapStatPeriod({
        id,
        from: new Date(from),
        to: new Date(to),
        swapsCount: 0,
        usersCount: 0,
        pairsCount: 0,
        totalAmountUSD: '0',
    })
}