module.exports = class Data1658996183978 {
  name = 'Data1658996183978'

  async up(db) {
    await db.query(`CREATE TABLE "swap_stat_period" ("id" character varying NOT NULL, "from" TIMESTAMP WITH TIME ZONE NOT NULL, "to" TIMESTAMP WITH TIME ZONE NOT NULL, "swaps_count" integer NOT NULL, "pairs_count" integer NOT NULL, "users_count" integer NOT NULL, "total_amount_usd" numeric(38,20) NOT NULL, CONSTRAINT "PK_d565eb3e3cf20b3a7fe0788e5eb" PRIMARY KEY ("id"))`)
  }

  async down(db) {
    await db.query(`DROP TABLE "swap_stat_period"`)
  }
}
