module.exports = class Data1658846160466 {
  name = 'Data1658846160466'

  async up(db) {
    await db.query(`CREATE TABLE "swap_stat" ("id" character varying NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "day_swaps_count" integer NOT NULL, "week_swaps_count" integer NOT NULL, "month_swaps_count" integer NOT NULL, "day_pairs_count" integer NOT NULL, "week_pairs_count" integer NOT NULL, "month_pairs_count" integer NOT NULL, "day_users_count" integer NOT NULL, "week_users_count" integer NOT NULL, "month_users_count" integer NOT NULL, "total_amount_usd" numeric(38,20) NOT NULL, CONSTRAINT "PK_a50971112880c510d0ca3a29521" PRIMARY KEY ("id"))`)
    await db.query(`CREATE TABLE "swapper" ("id" character varying NOT NULL, "type" character varying(5) NOT NULL, "day_amount_usd" numeric(38,20) NOT NULL, "week_amount_usd" numeric(38,20) NOT NULL, "month_amount_usd" numeric(38,20) NOT NULL, CONSTRAINT "PK_f3c23c1fea67a1be178aa5091d1" PRIMARY KEY ("id"))`)
  }

  async down(db) {
    await db.query(`DROP TABLE "swap_stat"`)
    await db.query(`DROP TABLE "swapper"`)
  }
}
