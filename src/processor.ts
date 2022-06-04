import { SubstrateEvmProcessor } from "@subsquid/substrate-evm-processor";
import { lookupArchive } from "@subsquid/archive-registry";
import * as factory from "./types/abi/factory";
import { handleNewPair } from "./mappings/factory";
import { CHAIN_NODE, FACTORY_ADDRESS } from "./consts";

const processor = new SubstrateEvmProcessor("beamswap-squid");

processor.setBatchSize(500);

processor.setDataSource({
  chain: CHAIN_NODE,
  archive: lookupArchive("moonbase")[0].url,
});

processor.setTypesBundle("moonbeam");

processor.addEvmLogHandler(
  FACTORY_ADDRESS,
  {
    filter: [
      factory.events["PairCreated(address,address,address,uint256)"].topic,
    ],
  },
  handleNewPair
);

// export async function contractLogsHandler(
//   ctx: EvmLogHandlerContext
// ): Promise<void> {
//   const transfer =
//     erc721.events["Transfer(address,address,uint256)"].decode(ctx);

//   let from = await ctx.store.get(Owner, transfer.from);
//   if (from == null) {
//     from = new Owner({ id: transfer.from, balance: 0n });
//     await ctx.store.save(from);
//   }

//   let to = await ctx.store.get(Owner, transfer.to);
//   if (to == null) {
//     to = new Owner({ id: transfer.to, balance: 0n });
//     await ctx.store.save(to);
//   }

//   let token = await ctx.store.get(Token, transfer.tokenId.toString());
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

processor.run();
