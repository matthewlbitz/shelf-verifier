const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createApp } = require("../server");
test("read-only API handles shelf normalization, unknown and ambiguous barcodes", async () => {
  const db = new Database(":memory:");
  db.exec(
    `CREATE TABLE rainbow_albums(barcode TEXT,artist TEXT,title TEXT,final_shelf TEXT,primary_genre TEXT,secondary_genre TEXT);INSERT INTO rainbow_albums VALUES ('001','Artist','<img onerror=alert(1)>',' 19e ','Rock',NULL),('dup','A','B','20A','Jazz',''),('dup','C','D','20A','Jazz','');`,
  );
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(base + "/api/shelf/19e");
    assert.equal((await r.json()).albumCount, 1);
    assert.equal((await fetch(base + "/api/shelf/unknown")).status, 404);
    r = await fetch(base + "/api/album/001");
    assert.equal((await r.json()).album.barcode, "001");
    assert.equal((await fetch(base + "/api/album/dup")).status, 409);
    assert.equal((await fetch(base + "/api/album/nope")).status, 404);
    assert.equal((await fetch(base + "/api/nope")).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
