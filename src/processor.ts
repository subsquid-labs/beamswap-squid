import { SubstrateEvmProcessor } from '@subsquid/substrate-evm-processor'
import { lookupArchive } from '@subsquid/archive-registry'
import * as factory from './types/abi/factory'
import * as pair from './types/abi/pair'
import { handleNewPair } from './mappings/factory'
import { CHAIN_NODE, FACTORY_ADDRESS } from './consts'
import { handleTransfer } from './mappings/core'

const processor = new SubstrateEvmProcessor('beamswap-squid')

processor.setBatchSize(500)

processor.setDataSource({
    chain: CHAIN_NODE,
    archive: lookupArchive('moonbeam')[0].url,
})

processor.setTypesBundle('moonbeam')

// processor.setBlockRange({
//     from: 1483285,
// })

processor.addEvmLogHandler(
    FACTORY_ADDRESS,
    {
        filter: [factory.events['PairCreated(address,address,address,uint256)'].topic],
    },
    handleNewPair
)

const pairContracts = [
    '0x0f9cf146e871ed2c1af0503359f3250c33a401be',
    '0x0fa6c6cdbe5c6b9a9cd5a0bd7847024441ae1884',
    '0x12e90d1629735c4d88ed9e569ad8bc1953bd8a81',
    '0x1575352ee631cbeaaaae0744b04578ab587243e6',
    '0x1eb198bcc08a5a0ec2d6d47ffde19a68d2d137e3',
    '0x0230937449E9aa94662098a4a751af97C23a8797',
    '0x7c42BE5c88A2A4Eb6C5f0Cf3460A01C0f52CDB13',
    '0xe3311f7d52f5f3e71167E41711F719E6c291FcFf',
    '0x180609CB37FDF36a457086eFacEC5A011c371d21',
    '0x2839905f837976E7aDD2AfFCf2a538f8b171Ad36'
]

pairContracts.forEach((contract) =>
    processor.addEvmLogHandler(
        contract,
        {
            filter: [pair.events['Transfer(address,address,uint256)'].topic],
        },
        handleTransfer
    )
)

// export async function contractLogsHandler(
//   ctx: EvmLogHandlerContext
// ): Promise<void> {
//   const transfer =
//     erc721.events["Transfer(address,address,uint256)"].decode(ctx);

//   let from = await ctx.store.findOne(Owner, transfer.from);
//   if (from == null) {
//     from = new Owner({ id: transfer.from, balance: 0n });
//     await ctx.store.save(from);
//   }

//   let to = await ctx.store.findOne(Owner, transfer.to);
//   if (to == null) {
//     to = new Owner({ id: transfer.to, balance: 0n });
//     await ctx.store.save(to);
//   }

//   let token = await ctx.store.findOne(Token, transfer.tokenId.toString());
//   if (token == null) {
//     token = new Token({
//       id: transfer.tokenId.toString(),
//       uri: await contract.tokenURI(transfer.tokenId),
//       contract: await getContractEntity(ctx),
//       owner: to,
//     });
//     await ctx.store.save(token);
//   } else {
//     token.owner = to;
//     await ctx.store.save(token);
//   }

//   await ctx.store.save(
//     new Transfer({
//       id: ctx.txHash,
//       token,
//       from,
//       to,
//       timestamp: BigInt(ctx.substrate.block.timestamp),
//       block: ctx.substrate.block.height,
//       transactionHash: ctx.txHash,
//     })
//   );
// }

processor.run()
