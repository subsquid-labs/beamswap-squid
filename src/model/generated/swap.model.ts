import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {Transaction} from "./transaction.model"
import {Pair} from "./pair.model"
import bigDecimal from "js-big-decimal"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class Swap {
  constructor(props?: Partial<Swap>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Transaction, {nullable: true})
  transaction!: Transaction

  @Column_("timestamp with time zone", {nullable: false})
  timestamp!: Date

  @Column_("text", {nullable: true})
  pairId!: string | undefined | null

  @Index_()
  @ManyToOne_(() => Pair, {nullable: true})
  pair!: Pair

  @Column_("text", {nullable: false})
  sender!: string

  @Column_("text", {nullable: true})
  from!: string | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  amount0In!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  amount1In!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  amount0Out!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  amount1Out!: bigDecimal

  @Column_("text", {nullable: false})
  to!: string

  @Column_("int4", {nullable: true})
  logIndex!: number | undefined | null

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  amountUSD!: bigDecimal
}
