import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Token} from "./token.model"

@Entity_()
export class TokenDayData {
  constructor(props?: Partial<TokenDayData>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  date!: number

  @Index_()
  @ManyToOne_(() => Token, {nullable: false})
  token!: Token

  @Column_("numeric", {nullable: false})
  dailyVolumeToken!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeETH!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  dailyTxns!: bigint

  @Column_("numeric", {nullable: false})
  totalLiquidityToken!: number

  @Column_("numeric", {nullable: false})
  totalLiquidityETH!: number

  @Column_("numeric", {nullable: false})
  totalLiquidityUSD!: number

  @Column_("numeric", {nullable: false})
  priceUSD!: number
}
