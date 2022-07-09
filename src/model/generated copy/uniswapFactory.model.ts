import bigDecimal from "js-big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import {bigDecimalTransformer} from "./marshal"

@Entity_()
export class UniswapFactory {
  constructor(props?: Partial<UniswapFactory>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  pairCount!: number

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalVolumeUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalVolumeETH!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  untrackedVolumeUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalLiquidityUSD!: bigDecimal

  @Column_("text", {transformer: bigDecimalTransformer, nullable: false})
  totalLiquidityETH!: bigDecimal

  @Column_("int4", {nullable: false})
  txCount!: number
}
