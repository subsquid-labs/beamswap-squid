import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Transaction} from "./transaction.model"
import {Pair} from "./pair.model"

@Entity_()
export class Mint {
  constructor(props?: Partial<Mint>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Transaction, {nullable: false})
  transaction!: Transaction

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  timestamp!: bigint

  @Index_()
  @ManyToOne_(() => Pair, {nullable: false})
  pair!: Pair

  @Column_("text", {nullable: false})
  to!: string

  @Column_("numeric", {nullable: false})
  liquidity!: number

  @Column_("text", {nullable: true})
  sender!: string | undefined | null

  @Column_("numeric", {nullable: true})
  amount0!: number | undefined | null

  @Column_("numeric", {nullable: true})
  amount1!: number | undefined | null

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: true})
  logIndex!: bigint | undefined | null

  @Column_("numeric", {nullable: true})
  amountUSD!: number | undefined | null

  @Column_("text", {nullable: true})
  feeTo!: string | undefined | null

  @Column_("numeric", {nullable: true})
  feeLiquidity!: number | undefined | null
}
