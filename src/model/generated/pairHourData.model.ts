import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Pair} from "./pair.model"

@Entity_()
export class PairHourData {
  constructor(props?: Partial<PairHourData>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("int4", {nullable: false})
  hourStartUnix!: number

  @Index_()
  @ManyToOne_(() => Pair, {nullable: false})
  pair!: Pair

  @Column_("numeric", {nullable: false})
  reserve0!: number

  @Column_("numeric", {nullable: false})
  reserve1!: number

  @Column_("numeric", {nullable: false})
  totalSupply!: number

  @Column_("numeric", {nullable: false})
  reserveUSD!: number

  @Column_("numeric", {nullable: false})
  hourlyVolumeToken0!: number

  @Column_("numeric", {nullable: false})
  hourlyVolumeToken1!: number

  @Column_("numeric", {nullable: false})
  hourlyVolumeUSD!: number

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  hourlyTxns!: bigint
}
