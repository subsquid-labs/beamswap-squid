module.exports = class Data1658944746053 {
  name = 'Data1658944746053'

  async up(db) {
    await db.query(`CREATE INDEX "IDX_d1b82e67bf623b7d80b0c9e81e" ON "swap" ("timestamp") `)
    await db.query(`CREATE INDEX "IDX_24569944ba7a0eb0cf12d51a15" ON "swap" ("to") `)
  }

  async down(db) {
    await db.query(`DROP INDEX "public"."IDX_d1b82e67bf623b7d80b0c9e81e"`)
    await db.query(`DROP INDEX "public"."IDX_24569944ba7a0eb0cf12d51a15"`)
  }
}
