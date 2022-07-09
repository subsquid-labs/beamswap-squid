import { Contract, providers } from 'ethers'
import { CHAIN_NODE, FACTORY_ADDRESS } from './consts'
import * as erc20 from './types/abi/erc20'
import * as factory from './types/abi/factory'
import * as erc20NameBytes from './types/abi/erc20NameBytes'
import * as erc20SymbolBytes from './types/abi/erc20SymbolBytes'
import * as pair from './types/abi/pair'
import { Store } from '@subsquid/typeorm-store'
import { Pair } from './model'

export function createErc20Contract(address: string): Contract {
    return new Contract(address, erc20.abi, new providers.WebSocketProvider(CHAIN_NODE))
}

export function createErc20NameBytesContract(address: string): Contract {
    return new Contract(address, erc20NameBytes.abi, new providers.WebSocketProvider(CHAIN_NODE))
}

export function createErc20SymbolBytesContract(address: string): Contract {
    return new Contract(address, erc20SymbolBytes.abi, new providers.WebSocketProvider(CHAIN_NODE))
}

class PairContractsManager {
    private _pairContracts = new Map<string, Contract>()

    private _isInitialized = false
    get isInitialized() {
        return this._isInitialized
    }

    async init(store: Store) {
        const constracts = await store.find(Pair)
        for (const contract of constracts) this.add(contract.id)

        this._isInitialized = true
        return this
    }

    get(address: string) {
        this.checkInit()
        return this._pairContracts.get(address.toLowerCase())
    }

    has(address: string) {
        this.checkInit()
        return this._pairContracts.has(address.toLowerCase())
    }

    add(address: string) {
        const ethersContract = new Contract(address, pair.abi, new providers.WebSocketProvider(CHAIN_NODE))
        this._pairContracts.set(address.toLowerCase(), ethersContract)
    }

    private checkInit() {
        if (!this._isInitialized) throw new Error('Pair contracts manager used before initialization')
    }
}

export const pairContracts = new PairContractsManager()

export const factoryContract = new Contract(FACTORY_ADDRESS, factory.abi, new providers.WebSocketProvider(CHAIN_NODE))

export const knownPairAdresses = [
    '0x99588867e817023162f4d4829995299054a5fc57',
    '0xb929914b89584b4081c7966ac6287636f7efd053',
    '0xa0799832fb2b9f18acf44b92fbbedcfd6442dd5e',
    '0x34a1f4ab3548a92c6b32cd778eed310fcd9a340d',
    '0x6ba3071760d46040fb4dc7b627c9f68efaca3000',
    '0xd913e1d00b75c76345204ade4169e17d1e3770be',
    '0x90131d7b42a8169c3256e1aa86a49e4a7a1e5610',
    '0xa35b2c07cb123ea5e1b9c7530d0812e7e03ec3c1',
    '0x7ef9491774a81f6db7bb759fe2f645c334dcf5b1',
    '0xd7249c0ddf75b638958d320ceb9e4a776d2665f9',
    '0x321e45b7134b5ed52129027f1743c8e71da0a339',
    '0xd8fbdef502770832e90a6352b275f20f38269b74',
    '0x75200a8550C8B22CC5D312F248Ea9439e2f654EE',
    '0xfC422EB0A2C7a99bAd330377497FD9798c9B1001',
    '0xf9B5B686B4586A80dc312ddf2bF24b178a1a5849',
    '0x6Ba38f006aFe746B9A0d465e53aB4182147AC3D7',
    '0x35087c00C4Cf750510acd2E4EE32b9e6D1a60655',
    '0x2035dE7417df16f64574950925Cf4648216D8a2c',
    '0xB9dF731DC101E4c1e69e45A857F9ff06d482Cb26',
]
