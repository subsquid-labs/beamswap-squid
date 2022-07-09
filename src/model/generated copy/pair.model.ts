import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, OneToMany as OneToMany_} from "typeorm"
import {Token} from "./token.model"
import {LiquidityPosition} from "./liquidityPosition.model"
import {Mint} from "./mint.model"
import {Burn} from "./burn.model"
import {Swap} from "./swap.model"
import bigDecimal from "js-big-decimal"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class Pair {
  constructor(props?: Partial<Pair>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  token0!: Token

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  token1!: Token

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  reserve0!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  reserve1!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalSupply!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  reserveETH!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  reserveUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  trackedReserveETH!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  token0Price!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  token1Price!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  volumeToken0!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  volumeToken1!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  volumeUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  untrackedVolumeUSD!: bigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number

  @Column_("timestamp with time zone", {nullable: false})
  createdAtTimestamp!: Date

  @Column_("int4", {nullable: false})
  createdAtBlockNumber!: number

  @Column_("int4", {nullable: false})
  liquidityProviderCount!: number

  @OneToMany_(() => LiquidityPosition, e => e.pair)
  liquidityPositions!: LiquidityPosition[]

  @OneToMany_(() => Mint, e => e.pair)
  mints!: Mint[]

  @OneToMany_(() => Burn, e => e.pair)
  burns!: Burn[]

  @OneToMany_(() => Swap, e => e.pair)
  swaps!: Swap[]
}
