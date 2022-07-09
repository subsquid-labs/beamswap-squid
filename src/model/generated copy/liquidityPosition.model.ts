import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {User} from "./user.model"
import {Pair} from "./pair.model"
import bigDecimal from "js-big-decimal"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class LiquidityPosition {
  constructor(props?: Partial<LiquidityPosition>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => User, {nullable: true})
  user!: User

  @Index_()
  @ManyToOne_(() => Pair, {nullable: true})
  pair!: Pair

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  liquidityTokenBalance!: bigDecimal
}
