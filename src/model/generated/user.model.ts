import bigDecimal from "js-big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToMany as OneToMany_} from "typeorm"
import {LiquidityPosition} from "./liquidityPosition.model"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class User {
  constructor(props?: Partial<User>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @OneToMany_(() => LiquidityPosition, e => e.user)
  liquidityPositions!: LiquidityPosition[]

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  usdSwapped!: bigDecimal
}
