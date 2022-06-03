import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Token} from "./token.model"

@Entity_()
export class PairDayData {
  constructor(props?: Partial<PairDayData>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  date!: number

  @Column_("bytea", {nullable: false})
  pairAddress!: Uint8Array

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
  reserveUSD!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeToken0!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeToken1!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  dailyTxns!: bigint
}
