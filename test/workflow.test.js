const { test } = require("node:test");
const assert = require("node:assert/strict");
const W = require("../public/workflow");
const a = (barcode, secondary_genre = "", final_shelf = "19E") => ({
  barcode,
  secondary_genre,
  final_shelf,
  primary_genre: "Rock",
});
test("each placement on a destination top reverses its processed order without mutation", () => {
  const input = [a("A"), a("B"), a("C")];
  assert.deepEqual(
    W.transfer(input, () => 1)
      .get(1)
      .map((a) => a.barcode),
    ["C", "B", "A"],
  );
  assert.equal(input[0].barcode, "A");
});
test("all physical stages and bottom-first reshelving preserve relative shelf order", () => {
  const scans = [
    a("A"),
    a("B", "Jazz"),
    a("X", "", "20A"),
    a("C"),
    a("D", "Jazz"),
  ];
  const p = W.plan(scans, "19e");
  const ids = (x) => x.map((a) => a.barcode);
  assert.deepEqual(ids(p.scannedStack), ["D", "C", "X", "B", "A"]);
  assert.deepEqual(ids(p.correct), ["A", "B", "C", "D"]);
  assert.deepEqual(ids(p.misplaced), ["X"]);
  assert.deepEqual(
    p.piles.map((x) => [x.number, ids(x.albums)]),
    [
      [1, ["C", "A"]],
      [2, ["D", "B"]],
    ],
  );
  assert.deepEqual(
    p.piles.flatMap((x) => x.albums.toReversed()).map((a) => a.barcode),
    ["A", "C", "B", "D"],
  );
});
test("blank genres, aliases, prototype-like strings and empty reserved pile", () => {
  const p = W.plan(
    [
      a("A", null),
      a("B", "  "),
      a("C", " Jazz "),
      a("D", "jazz"),
      a("E", "__proto__"),
    ],
    "19E",
  );
  assert.equal(p.piles[0].albums.length, 2);
  assert.equal(p.piles.find((x) => x.genre === "Jazz").albums.length, 2);
  assert.ok(p.piles.find((x) => x.genre === "__proto__"));
  assert.equal(W.plan([a("A", "Jazz")], "19E").piles[0].number, 2);
  assert.equal(W.tape("Classical/Stage&Screen").label, "Light Green");
  assert.equal(W.tape(null).label, "Check genre");
});
test("empty, all misplaced, no secondary genres and final batches", () => {
  assert.deepEqual(W.plan([], "19E").piles, []);
  assert.equal(W.plan([a("A", "", "20A")], "19E").correct.length, 0);
  assert.equal(W.plan([a("A"), a("B")], "19E").piles.length, 1);
  const xs = Array.from({ length: 13 }, (_, i) => a(String(i)));
  assert.equal(W.batch(xs, 10).items.length, 3);
  assert.equal(W.batch([], 0).start, 0);
});

test("many interleaved CDs conserve every album and preserve genre-relative order", () => {
  for (let length = 1; length <= 100; length++) {
    const scans = Array.from({ length }, (_, i) =>
      a(String(i), ["", "Jazz", "Latin"][i % 3], i % 5 === 0 ? "20A" : "19E"),
    );
    const p = W.plan(scans, "19E");
    assert.equal(p.correct.length + p.misplaced.length, length);
    assert.equal(
      p.piles.reduce((sum, pile) => sum + pile.albums.length, 0),
      p.correct.length,
    );
    for (const pile of p.piles)
      assert.deepEqual(
        pile.albums.toReversed().map((a) => a.barcode),
        scans
          .filter(
            (a) =>
              a.final_shelf === "19E" &&
              W.genre(a.secondary_genre) === pile.genre,
          )
          .map((a) => a.barcode),
      );
  }
});

test("unknown scans remain in physical order, go to Pile 2 and have no stack destination", () => {
  const unknown = W.unknownAlbum("000-not-found");
  const scans = [a("A"), unknown, a("B", "", "20A"), a("C")];
  const p = W.plan(scans, "19E");
  assert.deepEqual(
    p.scannedStack.map((a) => a.barcode),
    ["C", "B", "000-not-found", "A"],
  );
  assert.deepEqual(
    p.misplaced.map((a) => a.barcode),
    ["000-not-found", "B"],
  );
  assert.deepEqual(
    p.correct.map((a) => a.barcode),
    ["A", "C"],
  );
  assert.equal(W.destination(unknown), "");
  assert.equal(W.destination(a("B", "", " 20a ")), "20A");
  for (const value of [null, "", "  ", "Not in stacks", "Set aside"]) {
    assert.equal(W.destination(a("X", "", value)), "");
    assert.equal(W.belongs(a("X", "", value), "19E"), false);
  }
  assert.equal(W.plan([unknown], "19E").piles.length, 0);
});
