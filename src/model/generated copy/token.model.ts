import bigDecimal from "js-big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import * as marshal from "./marshal"
import {bigDecimalTransformer} from "./marshal"

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

  @Column_("int4", {nullable: false})
  decimals!: number

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalSupply!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  tradeVolume!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  tradeVolumeUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  untrackedVolumeUSD!: bigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalLiquidity!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  derivedETH!: bigDecimal
}
