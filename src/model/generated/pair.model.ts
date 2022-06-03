import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, OneToMany as OneToMany_} from "typeorm"
import * as marshal from "./marshal"
import {Token} from "./token.model"
import {PairHourData} from "./pairHourData.model"
import {LiquidityPosition} from "./liquidityPosition.model"
import {LiquidityPositionSnapshot} from "./liquidityPositionSnapshot.model"
import {Mint} from "./mint.model"
import {Burn} from "./burn.model"
import {Swap} from "./swap.model"

@Entity_()
export class Pair {
  constructor(props?: Partial<Pair>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: false})
  token0!: Token

  @Index_()
  @ManyToOne_(() => Token, {nullable: false})
  token1!: Token

  @Column_("numeric", {nullable: false})
  reserve0!: number

  @Column_("numeric", {nullable: false})
  reserve1!: number

  @Column_("numeric", {nullable: false})
  totalSupply!: number

  @Column_("numeric", {nullable: false})
  reserveETH!: number

  @Column_("numeric", {nullable: false})
  reserveUSD!: number

  @Column_("numeric", {nullable: false})
  trackedReserveETH!: number

  @Column_("numeric", {nullable: false})
  token0Price!: number

  @Column_("numeric", {nullable: false})
  token1Price!: number

  @Column_("numeric", {nullable: false})
  volumeToken0!: number

  @Column_("numeric", {nullable: false})
  volumeToken1!: number

  @Column_("numeric", {nullable: false})
  volumeUSD!: number

  @Column_("numeric", {nullable: false})
  untrackedVolumeUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  txCount!: bigint

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  createdAtTimestamp!: bigint

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  createdAtBlockNumber!: bigint

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  liquidityProviderCount!: bigint

  @OneToMany_(() => PairHourData, e => e.pair)
  pairHourData!: PairHourData[]

  @OneToMany_(() => LiquidityPosition, e => e.pair)
  liquidityPositions!: LiquidityPosition[]

  @OneToMany_(() => LiquidityPositionSnapshot, e => e.pair)
  liquidityPositionSnapshots!: LiquidityPositionSnapshot[]

  @OneToMany_(() => Mint, e => e.pair)
  mints!: Mint[]

  @OneToMany_(() => Burn, e => e.pair)
  burns!: Burn[]

  @OneToMany_(() => Swap, e => e.pair)
  swaps!: Swap[]
}
