/* Arrays representing stacks are always TOP to BOTTOM. A transfer takes the
   source top CD and places it on the destination top, reversing that group. */
(function (root) {
  const clean = (value) => String(value ?? "").trim();
  const shelf = (value) => clean(value).toUpperCase();
  const key = (value) =>
    clean(value).toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ");
  const colors = [
    ["Hip Hop", "Red", "#e53935"],
    ["Jazz", "Orange", "#ff9800"],
    ["Rock", "Yellow", "#ffeb3b"],
    ["Classical/Stage & Screen", "Light Green", "#a9df87"],
    ["Folk/Country", "Dark Green", "#23743b"],
    ["Pop", "Baby Blue", "#a9d7f5"],
    ["Funk/Soul", "Medium Blue", "#368acc"],
    ["Blues", "Dark Blue", "#153b85"],
    ["World", "Purple", "#9954bd"],
    ["Electronic", "Pink", "#ef91bb"],
    ["Reggae", "Brown", "#87552f"],
    ["Latin", "Black", "#000"],
    ["Brass & Military", "Grey", "#aaa"],
    ["Non-Music", "White", "#fff"],
    ["Children's", "Gold", "#daa520"],
  ];
  function genre(value) {
    const name = clean(value);
    const compact = key(name).replace(/\s/g, "");
    const aliases = { "folk&country": "Folk/Country", country: "Folk/Country" };
    return (
      (Object.hasOwn(aliases, compact) ? aliases[compact] : "") ||
      colors.find((c) => key(c[0]).replace(/\s/g, "") === compact)?.[0] ||
      name
    );
  }
  function tape(value) {
    const name = genre(value);
    const color = colors.find((c) => c[0] === name);
    return {
      genre: name,
      label: color?.[1] || "Check genre",
      color: color?.[2] || null,
    };
  }
  function transfer(source, assignment) {
    const piles = new Map();
    for (const album of source) {
      const destination = assignment(album);
      if (!piles.has(destination)) piles.set(destination, []);
      piles.get(destination).push(album);
    }
    // Reverse once per destination: linear work even for large shelves.
    for (const stack of piles.values()) stack.reverse();
    return piles;
  }
  // Only catalog shelf labels identify a destination in the physical stacks.
  function destination(album) {
    if (album.lookup_status === "unknown") return "";
    const label = shelf(album.final_shelf);
    return /^\d+[A-Z]$/.test(label) ? label : "";
  }
  function belongs(album, target) {
    const label = destination(album);
    return Boolean(label) && label === shelf(target);
  }
  function unknownAlbum(barcode) {
    return {
      barcode: clean(barcode),
      title: "Unknown album",
      artist: "Not in catalog",
      final_shelf: null,
      primary_genre: null,
      secondary_genre: null,
      lookup_status: "unknown",
    };
  }
  function plan(scans, target) {
    const scannedStack = transfer(scans, () => 1).get(1) || [];
    const first = transfer(scannedStack, (a) => (belongs(a, target) ? 1 : 2));
    const correct = first.get(1) || [];
    const misplaced = first.get(2) || [];
    const names = new Map();
    for (const a of correct) {
      const g = genre(a.secondary_genre);
      if (g && !names.has(key(g))) names.set(key(g), g);
    }
    const genres = [...names.values()].sort((a, b) => a.localeCompare(b, "en"));
    const definitions = ["", ...genres].map((g, i) => ({
      number: i + 1,
      genre: g,
      label: g || "No secondary genre",
    }));
    const assignment = (a) =>
      definitions.find((p) => key(p.genre) === key(genre(a.secondary_genre)))
        .number;
    const stacks = transfer(correct, assignment);
    const piles = definitions.map((p) => ({
      ...p,
      albums: stacks.get(p.number) || [],
    }));
    return {
      scannedStack,
      correct,
      misplaced,
      definitions,
      assignment,
      piles: piles.filter((p) => p.albums.length),
    };
  }
  function batch(items, offset, size = 10) {
    return {
      items: items.slice(offset, offset + size),
      start: items.length ? offset + 1 : 0,
      end: Math.min(offset + size, items.length),
      total: items.length,
    };
  }
  const api = {
    clean,
    shelf,
    genre,
    tape,
    transfer,
    plan,
    batch,
    destination,
    belongs,
    unknownAlbum,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Workflow = api;
})(globalThis);
