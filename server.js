"use strict";
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  const shelfQuery = db.prepare(
    "SELECT COUNT(*) AS count FROM rainbow_albums WHERE UPPER(TRIM(final_shelf)) = ?",
  );
  const albumQuery =
    db.prepare(`SELECT barcode, artist, title, final_shelf, primary_genre, secondary_genre
    FROM rainbow_albums WHERE TRIM(CAST(barcode AS TEXT)) = ? LIMIT 2`);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/shelf/:shelf", (req, res) => {
    const shelf = req.params.shelf.trim().toUpperCase();
    if (!shelf || shelf.length > 80)
      return res.status(400).json({ error: "Enter a valid shelf label." });
    const { count } = shelfQuery.get(shelf);
    if (!count)
      return res
        .status(404)
        .json({
          valid: false,
          error: `Shelf ${shelf} has no assigned catalog albums or was not found.`,
        });
    res.json({ valid: true, shelf, albumCount: count });
  });
  app.get("/api/album/:barcode", (req, res) => {
    const barcode = req.params.barcode.trim();
    if (!barcode || barcode.length > 128)
      return res.status(400).json({ error: "Enter a valid barcode." });
    const albums = albumQuery.all(barcode);
    if (!albums.length)
      return res
        .status(404)
        .json({ found: false, error: `Barcode ${barcode} was not found.` });
    if (albums.length > 1)
      return res
        .status(409)
        .json({
          error: `Barcode ${barcode} matches multiple catalog entries. Resolve the catalog ambiguity before scanning.`,
        });
    res.json({ found: true, album: albums[0] });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Unknown lookup." }),
  );
  app.use(express.static(path.join(__dirname, "public")));
  app.use((error, req, res, next) => {
    console.error(error.message);
    res
      .status(error.status === 400 ? 400 : 500)
      .json({
        error:
          error.status === 400
            ? "Invalid lookup."
            : "Could not read the catalog. Try again.",
      });
  });
  return app;
}
if (require.main === module) {
  try {
    const db = new Database(path.join(__dirname, "masterAlbums.db"), {
      readonly: true,
      fileMustExist: true,
    });
    const port = Number(process.env.PORT || 3000);
    const server = createApp(db).listen(port, "127.0.0.1", () =>
      console.log(`KTRU Shelf Verifier running at http://localhost:${port}`),
    );
    server.on("error", (error) => {
      console.error(`Cannot start: ${error.message}`);
      db.close();
      process.exitCode = 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () =>
        server.close(() => {
          db.close();
          process.exit(0);
        }),
      );
  } catch (error) {
    console.error(`Cannot open masterAlbums.db: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { createApp };
