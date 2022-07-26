import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"

@Entity_()
export class SwapStat {
  constructor(props?: Partial<SwapStat>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Column_("timestamp with time zone", {nullable: false})
  timestamp!: Date

  @Column_('int4', { nullable: false })
  daySwapsCount!: number

  @Column_('int4', { nullable: false })
  weekSwapsCount!: number

  @Column_('int4', { nullable: false })
  monthSwapsCount!: number

  @Column_('int4', { nullable: false })
  dayPairsCount!: number

  @Column_('int4', { nullable: false })
  weekPairsCount!: number

  @Column_('int4', { nullable: false })
  monthPairsCount!: number

  @Column_('int4', { nullable: false })
  dayUsersCount!: number

  @Column_('int4', { nullable: false })
  weekUsersCount!: number

  @Column_('int4', { nullable: false })
  monthUsersCount!: number

  @Column_('numeric', { nullable: false, precision: 38, scale: 20 })
  totalAmountUSD!: string
}