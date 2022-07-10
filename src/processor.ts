import { SubstrateBatchProcessor } from '@subsquid/substrate-processor'
import * as factory from './types/abi/factory'
import * as pair from './types/abi/pair'
import { handleNewPair } from './mappings/factory'
import { CHAIN_NODE, FACTORY_ADDRESS } from './consts'
import { handleBurn, handleMint, handleSwap, handleSync, handleTransfer } from './mappings/core'
import { TypeormDatabase } from '@subsquid/typeorm-store'
import { pairContracts } from './contract'
import { getAddress } from '@ethersproject/address'
import { saveAll } from './mappings/entityUtils'

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
    .addEvmLog(FACTORY_ADDRESS.toLowerCase(), {
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

// for (const address of knownPairAdresses) {
//     processor.addEvmLog(address.toLowerCase(), {
//         filter: [
//             [
//                 pair.events['Transfer(address,address,uint256)'].topic,
//                 pair.events['Sync(uint112,uint112)'].topic,
//                 pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic,
//                 pair.events['Mint(address,uint256,uint256)'].topic,
//                 pair.events['Burn(address,uint256,uint256,address)'].topic,
//             ],
//         ],
//     })
// }

processor.run(database, async (ctx) => {
    await pairContracts.init(ctx.store)

    for (const block of ctx.blocks) {
        for (const item of block.items) {
            if (item.kind === 'event') {
                if (item.name === 'EVM.Log') {
                    const event = item.event
                    const contractAddress = getAddress(event.args.address)
                    if (contractAddress === FACTORY_ADDRESS && event.args.topics[0] === PAIR_CREATED_TOPIC) {
                        await handleNewPair(ctx, block.header, event)
                    } else if (pairContracts.has(contractAddress)) {
                        for (const topic of event.args.topics) {
                            switch (topic) {
                                case pair.events['Transfer(address,address,uint256)'].topic:
                                    await handleTransfer(ctx, block.header, event)
                                    break
                                case pair.events['Sync(uint112,uint112)'].topic:
                                    await handleSync(ctx, block.header, event)
                                    break
                                case pair.events['Swap(address,uint256,uint256,uint256,uint256,address)'].topic:
                                    await handleSwap(ctx, block.header, event)
                                    break
                                case pair.events['Mint(address,uint256,uint256)'].topic:
                                    await handleMint(ctx, block.header, event)
                                    break
                                case pair.events['Burn(address,uint256,uint256,address)'].topic:
                                    await handleBurn(ctx, block.header, event)
                                    break
                            }
                        }
                    }
                }
            }
        }
    }

    await saveAll(ctx.store)
})
