import { getOrCreatePool } from '../entities/swap'
import { getOrCreateToken } from '../entities/token'
import { Pool, TokenSwapEvent } from '../model'
import { EvmLogEvent } from '@subsquid/substrate-processor'
import * as SwapFlash from '../types/abi/swapFlashLoan'
import { convertTokenToDecimal } from '../utils/helpers'
import { BaseMapper, EntityClass, EntityMap } from './baseMapper'

interface TokenSwapData {
    txHash: string
    timestamp: Date
    blockNumber: number
    poolId: string
    soldId: number
    boughtId: number
    soldAmount: bigint
    boughtAmount: bigint
    buyer: string
}

export class TokenSwapMapper extends BaseMapper<TokenSwapData> {
    async parse(event: EvmLogEvent) {
        const contractAddress = event.args.address

        const data = SwapFlash.events['TokenSwap(address,uint256,uint256,uint128,uint128)'].decode(event.args)

        this.data = {
            poolId: contractAddress,
            timestamp: new Date(this.block.timestamp),
            blockNumber: this.block.height,
            txHash: event.evmTxHash,
            // user stats
            soldId: data.soldId.toNumber(),
            boughtId: data.boughtId.toNumber(),
            boughtAmount: data.tokensBought.toBigInt(),
            soldAmount: data.tokensSold.toBigInt(),
            buyer: data.buyer.toLowerCase(),
        }

        return this
    }

    getRequest(): Map<EntityClass, string[]> {
        if (this.data == null) {
            return new Map()
        } else {
            const { poolId } = this.data
            return new Map().set(Pool, [poolId])
        }
    }

    async process(entities: EntityMap) {
        if (this.data == null) return

        const { poolId, soldId, boughtId, timestamp, soldAmount, boughtAmount, txHash, buyer } = this.data

        const usdPrice = 1

        const pool = await getOrCreatePool.call(this, entities, poolId)

        const tokenSold = await getOrCreateToken.call(this, entities, pool.tokens[soldId].toLowerCase())
        const tokenBought = await getOrCreateToken.call(this, entities, pool.tokens[boughtId].toLowerCase())

        const exchange = new TokenSwapEvent({
            id: 'token_exchange-' + txHash,

            timestamp,
            pool,
            buyer,
            tokenSold,
            soldAmount,
            tokenBought,
            boughtAmount,

            amountUSD: convertTokenToDecimal(soldAmount, tokenSold.decimals)
                .plus(convertTokenToDecimal(boughtAmount, tokenBought.decimals))
                .div(2)
                .mul(usdPrice),
        })

        entities.get(TokenSwapEvent).set(exchange.id, exchange)
    }
}
