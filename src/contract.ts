import { Contract, providers } from "ethers";
import { CHAIN_NODE } from "./consts";
import * as erc20 from "./types/abi/erc20";
import * as erc20NameBytes from "./types/abi/erc20NameBytes";

const erc20Contracts: Map<string, Contract> = new Map();

export function getErc20Contract(address: string): Contract {
  let contract = erc20Contracts.get(address);
  if (!contract) {
    contract = new Contract(
      address,
      erc20.abi,
      new providers.WebSocketProvider(CHAIN_NODE)
    );
    erc20Contracts.set(address, contract);
  }

  return contract;
}

const erc20NameBytesContracts: Map<string, Contract> = new Map();

export function getErc20NameBytesContract(address: string): Contract {
  let contract = erc20NameBytesContracts.get(address);
  if (!contract) {
    contract = new Contract(
      address,
      erc20NameBytes.abi,
      new providers.WebSocketProvider(CHAIN_NODE)
    );
    erc20NameBytesContracts.set(address, contract);
  }

  return contract;
}