import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Transaction} from "./transaction.model"
import {Pair} from "./pair.model"
import { Big as BigDecimal } from 'big.js'
import {Token} from "./token.model"

@Entity_()
export class TokenSwapEvent {
  constructor(props?: Partial<TokenSwapEvent>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Transaction, {nullable: true})
  transaction!: Transaction

  @Column_("timestamp with time zone", {nullable: false})
  timestamp!: Date

  @Index_()
  @ManyToOne_(() => Pair, {nullable: true})
  pair!: Pair

  @Column_("text", {nullable: false})
  pairId!: string

  @Column_("text", {nullable: false})
  buyer!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  tokenSold!: Token

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  soldAmount!: bigint

  @Index_()
  @ManyToOne_(() => Token, {nullable: true})
  tokenBought!: Token

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  boughtAmount!: bigint

  /**
   * BigDecimal
   */
  @Column_("numeric", {nullable: false, precision: 38, scale: 20, transformer: marshal.bigDecimalTransformer})
  amountUSD!: BigDecimal
}