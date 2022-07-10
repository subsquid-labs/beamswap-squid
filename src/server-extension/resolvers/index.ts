import { Arg, Field, ObjectType, Query, Resolver, registerEnumType } from 'type-graphql'
import 'reflect-metadata'
import type { EntityManager } from 'typeorm'
import { MoreThanOrEqual } from 'typeorm'
import { Swap } from '../../model'
import bigDecimal from 'js-big-decimal'

@ObjectType()
class SwapperObject {
    constructor(props?: Partial<SwapperObject>) {
        Object.assign(this, props)
    }

    @Field(() => String, { nullable: false })
    id!: string

    @Field(() => String, { nullable: false })
    amountUSD!: string

    @Field(() => Number, { nullable: false })
    swapsCount!: number
}

enum Order {
    DESC = 'DESC',
    ASC = 'ASC',
}

enum Range {
    DAY = '24 HOUR',
    WEEK = '7 DAY',
    MONTH = '30 DAY',
    YEAR = '365 DAY',
}

registerEnumType(Order, { name: 'Order' })
registerEnumType(Range, { name: 'Range' })

@Resolver()
export class TradersResolver {
    constructor(private tx: () => Promise<EntityManager>) {}

    @Query(() => [SwapperObject])
    async getUsersTop(
        @Arg('limit', { nullable: true, defaultValue: null })
        limit: number,
        @Arg('offset', { nullable: true, defaultValue: 0 })
        offset: number,
        @Arg('orderDirection', () => Order, { nullable: true, defaultValue: Order.DESC })
        orderDirection: Order,
        @Arg('dateRange', () => Range, { nullable: false, defaultValue: Range.DAY })
        dateRange: Range
    ): Promise<SwapperObject[]> {
        const swappers: Map<string, SwapperObject> = new Map()

        let lastId: string | undefined

        const now = Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000

        while (true) {
            const query = `
                SELECT
                    id, "to" as user, amount_usd
                FROM swap
                WHERE
                    timestamp >= NOW() - INTERVAL '${dateRange}'
                    ${lastId != null ? `AND id < '${lastId}'` : ``}
                ORDER BY id DESC
                LIMIT 10000`

            const manager = await this.tx()
            const repository = manager.getRepository(Swap)
            const result: { id: string; user: string; amount_usd: string }[] = await repository.query(query)

            if (result.length === 0) break

            for (const data of result) {
                let swapper = swappers.get(data.user)
                if (swapper == null) {
                    swapper = new SwapperObject({
                        id: data.user,
                        amountUSD: '0',
                        swapsCount: 0,
                    })
                    swappers.set(swapper.id, swapper)
                }

                swapper.amountUSD = bigDecimal.add(swapper.amountUSD, data.amount_usd)
                swapper.swapsCount += 1

                lastId = data.id
            }

            console.log(query)
        }

        return [...swappers.values()]
            .sort((a, b) => bigDecimal.compareTo(b.amountUSD, a.amountUSD))
            .slice(offset, offset + (limit != null ? limit : swappers.size))
    }

    @Query(() => [SwapperObject])
    async getPairsTop(
        @Arg('limit', { nullable: true, defaultValue: null })
        limit: number,
        @Arg('offset', { nullable: true, defaultValue: 0 })
        offset: number,
        @Arg('orderDirection', () => Order, { nullable: true, defaultValue: Order.DESC })
        orderDirection: Order,
        @Arg('dateRange', () => Range, { nullable: false, defaultValue: Range.DAY })
        dateRange: Range
    ): Promise<SwapperObject[]> {
        const swappers: Map<string, SwapperObject> = new Map()

        let lastId: string | undefined

        const now = Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000

        while (true) {
            const query = `
                SELECT
                    id, amount_usd, pair_id
                FROM swap
                WHERE
                    timestamp >= NOW() - INTERVAL '${dateRange}'
                    ${lastId != null ? `AND id < '${lastId}'` : ``}
                ORDER BY id DESC
                LIMIT 10000`

            const manager = await this.tx()
            const repository = manager.getRepository(Swap)
            const result: { id: string; pair_id: string; amount_usd: string }[] = await repository.query(query)

            if (result.length === 0) break

            for (const data of result) {
                let swapper = swappers.get(data.pair_id)
                if (swapper == null) {
                    swapper = new SwapperObject({
                        id: data.pair_id,
                        amountUSD: '0',
                        swapsCount: 0,
                    })
                    swappers.set(swapper.id, swapper)
                }

                swapper.amountUSD = bigDecimal.add(swapper.amountUSD, data.amount_usd)
                swapper.swapsCount += 1

                lastId = data.id
            }

            console.log(query)
        }

        return [...swappers.values()]
            .sort((a, b) => bigDecimal.compareTo(b.amountUSD, a.amountUSD))
            .slice(offset, offset + (limit != null ? limit : swappers.size))
    }
}
