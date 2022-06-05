import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToMany as OneToMany_} from "typeorm"
import * as marshal from "./marshal"
import {TokenDayData} from "./tokenDayData.model"
import {PairDayData} from "./pairDayData.model"
import {Pair} from "./pair.model"

@Entity_()
export class Token {
  constructor(props?: Partial<Token>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("text", {nullable: false})
  symbol!: string

  @Column_("text", {nullable: false})
  name!: string

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  decimals!: bigint

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  totalSupply!: bigint

  @Column_("numeric", {nullable: false})
  tradeVolume!: number

  @Column_("numeric", {nullable: false})
  tradeVolumeUSD!: number

  @Column_("numeric", {nullable: false})
  untrackedVolumeUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  txCount!: bigint

  @Column_("numeric", {nullable: false})
  totalLiquidity!: number

  @Column_("numeric", {nullable: false})
  derivedETH!: number

  @OneToMany_(() => TokenDayData, e => e.token)
  tokenDayData!: TokenDayData[]

  @OneToMany_(() => PairDayData, e => e.token0)
  pairDayDataBase!: PairDayData[]

  @OneToMany_(() => PairDayData, e => e.token1)
  pairDayDataQuote!: PairDayData[]

  @OneToMany_(() => Pair, e => e.token0)
  pairBase!: Pair[]

  @OneToMany_(() => Pair, e => e.token1)
  pairQuote!: Pair[]
}
