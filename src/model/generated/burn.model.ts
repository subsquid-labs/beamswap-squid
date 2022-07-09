import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {Transaction} from "./transaction.model"
import {Pair} from "./pair.model"
import bigDecimal from "js-big-decimal"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class Burn {
  constructor(props?: Partial<Burn>) {
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

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  liquidity!: bigDecimal

  @Column_("text", {nullable: true})
  sender!: string | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: true})
  amount0!: bigDecimal | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: true})
  amount1!: bigDecimal | undefined | null

  @Column_("text", {nullable: true})
  to!: string | undefined | null

  @Column_("int4", {nullable: true})
  logIndex!: number | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: true})
  amountUSD!: bigDecimal | undefined | null

  @Column_("bool", {nullable: false})
  needsComplete!: boolean

  @Column_("text", {nullable: true})
  feeTo!: string | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: true})
  feeLiquidity!: bigDecimal | undefined | null
}
