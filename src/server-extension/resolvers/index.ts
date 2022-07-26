import { Arg, Field, ObjectType, Query, Resolver, registerEnumType, Int } from 'type-graphql'
import 'reflect-metadata'
import { EntityManager } from 'typeorm'
import { Swapper, SwapperType, SwapStat } from '../../model'
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
}

@ObjectType()
class TopObject {
    constructor(props?: Partial<TopObject>) {
        Object.assign(this, props)
    }

    @Field(() => Date, { nullable: false })
    timestamp!: Date

    @Field(() => Int, { nullable: false })
    count!: number

    @Field(() => Int, { nullable: false })
    swapsCount!: number

    @Field(() => String, { nullable: false })
    totalAmountUSD!: string

    @Field(() => [SwapperObject], { nullable: false })
    top!: SwapperObject[]
}

enum Order {
    ASC = 'ASC',
    DESC = 'DESC',
}

enum Range {
    DAY = '24 HOUR',
    WEEK = '7 DAY',
    MONTH = '30 DAY',
}

registerEnumType(Order, { name: 'Order' })
registerEnumType(Range, { name: 'Range' })

@Resolver()
export class TradersResolver {
    constructor(private tx: () => Promise<EntityManager>) {}

    @Query(() => TopObject || null)
    async getUsersTop(
        @Arg('limit', { nullable: true, defaultValue: null })
        limit: number,
        @Arg('offset', { nullable: true, defaultValue: 0 })
        offset: number,
        @Arg('order', () => Order, { nullable: true, defaultValue: Order.DESC })
        order: Order,
        @Arg('range', () => Range, { nullable: false })
        range: Range
    ): Promise<TopObject | null> {
        console.log(new Date(Date.now()), 'Query users top...')

        const top = await this.getTop(SwapperType.USER, limit, offset, order, range)

        return top
    }

    @Query(() => TopObject)
    async getPairsTop(
        @Arg('limit', { nullable: true, defaultValue: null })
        limit: number,
        @Arg('offset', { nullable: true, defaultValue: 0 })
        offset: number,
        @Arg('order', () => Order, { nullable: true, defaultValue: Order.DESC })
        order: Order,
        @Arg('range', () => Range, { nullable: false })
        range: Range
    ): Promise<TopObject> {
        console.log(new Date(Date.now()), 'Query pairs top...')

        const result = await this.getTop(SwapperType.PAIR, limit, offset, order, range)

        return result
    }

    private async getTop(type: SwapperType, limit: number, offset: number, order: Order, range: Range) {
        const manager = await this.tx()
        const stat = await manager.getRepository(SwapStat).findOneBy({ id: '0' })
        const top = await manager.find(Swapper, {
            where: { type },
            order: {
                dayAmountUSD: range === Range.DAY ? order : undefined,
                weekAmountUSD: range === Range.WEEK ? order : undefined,
                monthAmountUSD: range === Range.MONTH ? order : undefined,
            },
            take: limit,
            skip: offset,
        })

        return new TopObject({
            timestamp: stat?.timestamp,
            count:
                type === SwapperType.PAIR
                    ? range === Range.DAY
                        ? stat?.dayPairsCount
                        : range === Range.WEEK
                        ? stat?.weekPairsCount
                        : stat?.monthPairsCount
                    : range === Range.DAY
                    ? stat?.dayUsersCount
                    : range === Range.WEEK
                    ? stat?.weekUsersCount
                    : stat?.monthUsersCount,
            totalAmountUSD: stat?.totalAmountUSD,
            swapsCount:
                range === Range.DAY
                    ? stat?.daySwapsCount
                    : range === Range.WEEK
                    ? stat?.weekSwapsCount
                    : stat?.monthSwapsCount,
            top: top
                .map(
                    (s) =>
                        new SwapperObject({
                            id: s.id,
                            amountUSD:
                                range === Range.DAY
                                    ? s.dayAmountUSD
                                    : range === Range.WEEK
                                    ? s.weekAmountUSD
                                    : s.monthAmountUSD,
                        })
                )
                .sort((a, b) => bigDecimal.compareTo(a.amountUSD, b.amountUSD) * (order === Order.DESC ? -1 : 1))
                .slice(offset, limit != null ? offset + limit : undefined),
        })
    }
}
