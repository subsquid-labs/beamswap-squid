import {CommonHandlerContext} from '@subsquid/substrate-processor'
import {Store} from '@subsquid/typeorm-store'
import {ZERO_BD} from '../consts'
import {convertTokenToDecimal} from '../utils/helpers'

import {Token} from '../model'

import * as ERC20 from '../types/abi/erc20'

export async function getOrCreateToken(ctx: CommonHandlerContext<Store>, address: string): Promise<Token> {
    let token = await ctx.store.get(Token, address)

    if (token == null) {
        const erc20 = new ERC20.Contract(ctx, address)

        const name = await erc20.name()
        const symbol = await erc20.symbol()
        const decimals = await erc20.decimals()
        const totalSupply = await erc20.totalSupply()

        token = new Token({
            id: address.toLowerCase(),
            symbol,
            name,
            totalSupply: convertTokenToDecimal(totalSupply.toBigInt(), decimals),
            decimals,
            derivedETH: ZERO_BD,
            tradeVolume: ZERO_BD,
            tradeVolumeUSD: ZERO_BD,
            untrackedVolumeUSD: ZERO_BD,
            totalLiquidity: ZERO_BD,
            txCount: 0,
        })

        await ctx.store.save(token)
    }

    return token
}
