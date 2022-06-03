import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {LiquidityPosition} from "./liquidityPosition.model"
import {User} from "./user.model"
import {Pair} from "./pair.model"

@Entity_()
export class LiquidityPositionSnapshot {
  constructor(props?: Partial<LiquidityPositionSnapshot>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => LiquidityPosition, {nullable: false})
  liquidityPosition!: LiquidityPosition

  @Column_("int4", {nullable: false})
  timestamp!: number

  @Column_("int4", {nullable: false})
  block!: number

  @Index_()
  @ManyToOne_(() => User, {nullable: false})
  user!: User

  @Index_()
  @ManyToOne_(() => Pair, {nullable: false})
  pair!: Pair

  @Column_("numeric", {nullable: false})
  token0PriceUSD!: number

  @Column_("numeric", {nullable: false})
  token1PriceUSD!: number

  @Column_("numeric", {nullable: false})
  reserve0!: number

  @Column_("numeric", {nullable: false})
  reserve1!: number

  @Column_("numeric", {nullable: false})
  reserveUSD!: number

  @Column_("numeric", {nullable: false})
  liquidityTokenTotalSupply!: number

  @Column_("numeric", {nullable: false})
  liquidityTokenBalance!: number
}
