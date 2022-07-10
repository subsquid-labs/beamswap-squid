import { Arg, Field, ObjectType, Query, Resolver, registerEnumType } from 'type-graphql'
import 'reflect-metadata'
import type { EntityManager } from 'typeorm'
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
    ASC = 'ASC',
    DESC = 'DESC',
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
        @Arg('order', () => Order, { nullable: true, defaultValue: Order.DESC })
        order: Order,
        @Arg('range', () => Range, { nullable: false })
        range: Range
    ): Promise<SwapperObject[]> {
        console.log(new Date(Date.now()), 'Query users top...')

        const result = await this.getTop(range)

        return result.users
            .sort((a, b) => bigDecimal.compareTo(a.amountUSD, b.amountUSD) * (order === Order.DESC ? -1 : 1))
            .slice(offset, offset + (limit != null ? limit : result.users.length))
    }

    @Query(() => [SwapperObject])
    async getPairsTop(
        @Arg('limit', { nullable: true, defaultValue: null })
        limit: number,
        @Arg('offset', { nullable: true, defaultValue: 0 })
        offset: number,
        @Arg('order', () => Order, { nullable: true, defaultValue: Order.DESC })
        order: Order,
        @Arg('range', () => Range, { nullable: false })
        range: Range
    ): Promise<SwapperObject[]> {
        console.log(new Date(Date.now()), 'Query pairs top...')

        const result = await this.getTop(range)

        return result.pairs
            .sort((a, b) => bigDecimal.compareTo(a.amountUSD, b.amountUSD) * (order === Order.DESC ? -1 : 1))
            .slice(offset, offset + (limit != null ? limit : result.pairs.length))
    }

    private async getTop(range: Range) {
        const users: Map<string, SwapperObject> = new Map()
        const pairs: Map<string, SwapperObject> = new Map()

        // const now = Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000

        for await (const query of this.query(range, 10000)) {
            console.log(query.length)
            for (const data of query) {
                let user = users.get(data.user)
                if (user == null) {
                    user = new SwapperObject({
                        id: data.user,
                        amountUSD: '0',
                        swapsCount: 0,
                    })
                    users.set(user.id, user)
                }

                user.amountUSD = bigDecimal.add(user.amountUSD, data.amount_usd)
                user.swapsCount += 1

                let pair = pairs.get(data.pair)
                if (pair == null) {
                    pair = new SwapperObject({
                        id: data.pair,
                        amountUSD: '0',
                        swapsCount: 0,
                    })
                    pairs.set(pair.id, pair)
                }

                pair.amountUSD = bigDecimal.add(pair.amountUSD, data.amount_usd)
                pair.swapsCount += 1

            }
        }

        return { pairs: [...pairs.values()], users: [...users.values()] }
    }

    private async *query(range: Range, batchSize: number) {
        let lastId: string | undefined

        while (true) {
            console.log(lastId)

            const query = `
                SELECT
                    id, amount_usd, pair_id as pair, "to" as user
                FROM swap
                WHERE
                    timestamp >= NOW() - INTERVAL '${range}'
                    ${lastId != null ? `AND id < '${lastId}'` : ``}
                ORDER BY id DESC
                LIMIT ${batchSize}`

            const manager = await this.tx()
            const repository = manager.getRepository(Swap)
            const result: {
                id: string
                pair: string
                user: string
                amount_usd: string
            }[] = await repository.query(query)

            yield result

            if (result.length < batchSize) break

            lastId = result[result.length - 1].id
        }
    }
}
