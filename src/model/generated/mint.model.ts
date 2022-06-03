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

  @Column_("bytea", {nullable: false})
  to!: Uint8Array

  @Column_("numeric", {nullable: false})
  liquidity!: number

  @Column_("bytea", {nullable: true})
  sender!: Uint8Array | undefined | null

  @Column_("numeric", {nullable: true})
  amount0!: number | undefined | null

  @Column_("numeric", {nullable: true})
  amount1!: number | undefined | null

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: true})
  logIndex!: bigint | undefined | null

  @Column_("numeric", {nullable: true})
  amountUSD!: number | undefined | null

  @Column_("bytea", {nullable: true})
  feeTo!: Uint8Array | undefined | null

  @Column_("numeric", {nullable: true})
  feeLiquidity!: number | undefined | null
}
