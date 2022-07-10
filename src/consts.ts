import bigDecimal from 'js-big-decimal'

export const knownContracts: ReadonlyArray<string> = []

export const CHAIN_NODE = 'wss://moonbeam.api.onfinality.io/public-ws'
// export const CHAIN_NODE = "https://moonbeam.api.onfinality.io/public";

export const FACTORY_ADDRESS = '0x985BcA32293A7A496300a48081947321177a86FD'
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export const ZERO_BI = 0n
export const ONE_BI = 1n
export const ZERO_BD = new bigDecimal(0)
export const ONE_BD = new bigDecimal(1)
export const BI_18 = 1000000000000000000n

export const PRECISION = 32
