import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import * as marshal from "./marshal"

@Entity_()
export class UniswapDayData {
  constructor(props?: Partial<UniswapDayData>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  date!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeETH!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeUSD!: number

  @Column_("numeric", {nullable: false})
  dailyVolumeUntracked!: number

  @Column_("numeric", {nullable: false})
  totalVolumeETH!: number

  @Column_("numeric", {nullable: false})
  totalLiquidityETH!: number

  @Column_("numeric", {nullable: false})
  totalVolumeUSD!: number

  @Column_("numeric", {nullable: false})
  totalLiquidityUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  txCount!: bigint
}
