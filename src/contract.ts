import { Contract, providers } from 'ethers'
import { getAddress } from 'ethers/lib/utils'
import { CHAIN_NODE, FACTORY_ADDRESS } from './consts'
import * as erc20 from './types/abi/erc20'
import * as erc20NameBytes from './types/abi/erc20NameBytes'
import * as pair from './types/abi/pair'
import * as factory from './types/abi/factory'

const erc20Contracts: Map<string, Contract> = new Map()

export function getErc20Contract(address: string): Contract {
    let contract = erc20Contracts.get(address)
    if (!contract) {
        contract = new Contract(address, erc20.abi, new providers.WebSocketProvider(CHAIN_NODE))
        erc20Contracts.set(address, contract)
    }

    return contract
}

const erc20NameBytesContracts: Map<string, Contract> = new Map()

export function getErc20NameBytesContract(address: string): Contract {
    let contract = erc20NameBytesContracts.get(address)
    if (!contract) {
        contract = new Contract(address, erc20NameBytes.abi, new providers.WebSocketProvider(CHAIN_NODE))
        erc20NameBytesContracts.set(address, contract)
    }

    return contract
}

const pairContracts: Map<string, Contract> = new Map()

export function getPairContract(address: string): Contract {
    let contract = pairContracts.get(address)
    if (!contract) {
        contract = new Contract(address, pair.abi, new providers.WebSocketProvider(CHAIN_NODE))
        pairContracts.set(address, contract)
    }

    return contract
}

let factoryContract: Contract | undefined

export function getFactoryContract(): Contract {
    let contract = factoryContract
    if (!contract) {
        contract = new Contract(getAddress(FACTORY_ADDRESS), factory.abi, new providers.WebSocketProvider(CHAIN_NODE))
        factoryContract = contract
    }

    return contract
}
