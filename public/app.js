"use strict";
const W = window.Workflow;
const screen = document.querySelector("#screen");
const message = document.querySelector("#message");
let state = { stage: 0, target: "", scans: [], plan: null, offset: 0 };
let pending = 0,
  queue = Promise.resolve(),
  validating = false,
  lockedUntil = 0;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function note(text, error = false) {
  message.textContent = text;
  message.className = error ? "error" : "";
}
function action(label, fn, quiet = false) {
  const b = el("button", label, quiet ? "quiet" : "");
  b.type = "button";
  b.onclick = () => {
    if (Date.now() < lockedUntil) return;
    lockedUntil = Date.now() + 450;
    fn();
  };
  return b;
}
function row(album, assignment, index) {
  const r = el("div", undefined, "album");
  if (index !== undefined) r.append(el("span", String(index), "ordinal"));
  const info = el("div", undefined, "info");
  info.append(
    el("strong", W.clean(album.title) || "Untitled"),
    el("span", W.clean(album.artist) || "Unknown artist"),
    el("small", String(album.barcode)),
  );
  r.append(info);
  if (assignment) r.append(el("strong", assignment, "assignment"));
  return r;
}
// Highlight adjacent assignments only; never reorder the physical stack.
function sortingRows(albums, assignment, offset = 0) {
  let run = null;
  let previousAssignment;
  for (const [index, album] of albums.entries()) {
    const destination = assignment(album);
    if (!run || destination !== previousAssignment) {
      run = el("div", undefined, "sorting-run");
      screen.append(run);
    } else {
      run.classList.add("grouped");
    }
    run.append(row(album, destination, offset + index + 1));
    previousAssignment = destination;
  }
}
function inputForm(label, placeholder, submit) {
  const form = el("form");
  const lab = el("label", label);
  const input = el("input");
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  lab.append(input);
  form.append(lab);
  form.onsubmit = (e) => {
    e.preventDefault();
    submit(input);
  };
  screen.append(form);
  return { form, input };
}
async function api(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "Lookup failed.");
      error.status = response.status;
      error.notFound = response.status === 404 && data.found === false;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("Lookup timed out. Try again.");
    if (error.message === "Failed to fetch")
      throw new Error("Cannot reach the app. Check that it is running.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function go(stage) {
  state.stage = stage;
  state.offset = 0;
  note("");
  render();
  window.scrollTo(0, 0);
}
function render() {
  screen.replaceChildren();
  const title = el("h2");
  title.id = "stage-title";
  title.tabIndex = -1;
  screen.append(title);
  if (state.stage === 0) {
    title.textContent = "Select shelf";
    const { form, input } = inputForm(
      "Target shelf",
      "e.g. 19E",
      async (input) => {
        if (validating) return;
        const value = W.shelf(input.value);
        if (!value) {
          note("Enter a shelf first.", true);
          input.focus();
          return;
        }
        validating = true;
        b.disabled = true;
        note("Checking shelf…");
        try {
          const data = await api(`/api/shelf/${encodeURIComponent(value)}`);
          state.target = data.shelf;
          state.expected = data.albumCount;
          state.scans = [];
          go(1);
        } catch (e) {
          note(e.message, true);
          input.focus();
        } finally {
          validating = false;
          b.disabled = false;
        }
      },
    );
    const b = el("button", "Start verification");
    form.append(b);
    input.focus();
    return;
  }
  if (state.stage === 1) {
    title.textContent = `Scan albums for shelf ${state.target}`;
    screen.append(
      el(
        "p",
      ),
    );
    const { input } = inputForm("Barcode", "Scan barcode…", (input) => {
      const barcode = input.value.trim();
      if (!barcode) return;
      input.value = "";
      pending++;
      update();
      queue = queue.then(async () => {
        try {
          if (state.scans.some((a) => String(a.barcode) === barcode))
            throw new Error(
              `Already scanned: ${barcode}. Do not add it to the stack.`,
            );
          const data = await api(`/api/album/${encodeURIComponent(barcode)}`);
          if (
            state.scans.some(
              (a) => String(a.barcode) === String(data.album.barcode),
            )
          )
            throw new Error("This CD is already in the stack.");
          state.scans.push(data.album);
          note(
            `Accepted: ${data.album.artist || "Unknown artist"} — ${data.album.title || "Untitled"}`,
          );
        } catch (e) {
          if (e.notFound) {
            state.scans.push(W.unknownAlbum(barcode));
            note(
              `Barcode ${barcode} not found · added to Pile 2. Place it on top of the stack.`,
            );
          } else {
            note(
              `${e.message} Keep this CD out of the stack and retry if needed.`,
              true,
            );
          }
        } finally {
          pending--;
          update();
          input.focus();
        }
      });
    });
    const count = el("p", undefined, "summary"),
      list = el("div"),
      actions = el("div", undefined, "actions");
    screen.append(count, list, actions);
    const remove = action(
      "Remove last scanned",
      () => {
        const a = state.scans.pop();
        update();
        note(
          `Removed ${a.barcode}. Also remove the top CD from the physical stack.`,
        );
        input.focus();
      },
      true,
    );
    const finish = action("Finish scanning →", () => {
      state.plan = W.plan(state.scans, state.target);
      go(2);
    });
    actions.append(remove, finish);
    function update() {
      count.textContent = `${state.scans.length} scanned${pending ? ` · ${pending} lookup(s) pending` : ""}`;
      list.replaceChildren();
      state.scans
        .slice(-7)
        .toReversed()
        .forEach((a, i) => {
          const r = row(a, i === 0 ? "Newest" : "");
          if (!i) r.classList.add("latest");
          list.append(r);
        });
      remove.disabled = finish.disabled = pending > 0 || !state.scans.length;
    }
    update();
    input.focus();
    return;
  }
  const plan = state.plan;
  if (state.stage === 2 || state.stage === 4) {
    const secondary = state.stage === 4;
    title.textContent = secondary
      ? "Sort by secondary genre"
      : `Sort albums for shelf ${state.target}`;
    screen.append(
      el(
        "p",
        "Sort the stack into piles.",
      ),
    );
    const guide = el("div", undefined, "pile-guide");
    screen.append(guide);
    const items = secondary ? plan.correct : plan.scannedStack;
    const batch = W.batch(items, state.offset);
    sortingRows(
      batch.items,
      (album) => `${secondary ? plan.assignment(album) : W.belongs(album, state.target) ? 1 : 2}`,
      state.offset,
    );
    screen.append(
      el(
        "p",
        `${batch.start}–${batch.end} of ${batch.total} CDs`,
        "summary",
      ),
      action(
        batch.end === batch.total
          ? "Continue →"
          : `Next ${Math.min(10, batch.total - batch.end)} CDs →`,
        () => {
          if (batch.end < batch.total) {
            state.offset = batch.end;
            render();
            window.scrollTo(0, 0);
          } else go(secondary ? 5 : 3);
        },
      ),
    );
  } else if (state.stage === 3) {
    title.textContent = plan.misplaced.length
      ? "Sort Pile 2"
      : "No misplaced CDs";
    screen.append(
      el(
        "p",
        plan.misplaced.length
          ? "Return CDs to correct final shelf"
          : "Pile 2 is empty. Press continue to sort Pile 1",
      ),
    );
    sortingRows(
      plan.misplaced,
      (album) => W.destination(album) ? `Shelf ${W.destination(album)}` : "Set aside",
    );
    screen.append(action("Continue →", () => go(plan.correct.length ? 4 : 6)));
  } else if (state.stage === 5) {
    title.textContent = "Tape each pile";
    screen.append(el("p", "Keep piles in order. Apply the tape shown below."));
    for (const pile of plan.piles) {
      const card = el("div", undefined, "pile-card");
      card.append(
        el("h3", `Pile ${pile.number} · ${pile.label}`),
        el(
          "p",
          `${pile.albums.length} ${pile.albums.length === 1 ? "CD" : "CDs"}`,
        ),
      );
      const groups = new Map();
      pile.albums.forEach((a) => {
        const g = W.genre(a.primary_genre);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(a);
      });
      for (const [genre, albums] of groups) {
        card.append(tapeLine("BOTTOM", genre));
        if (groups.size > 1) {
          card.append(
            el("p", `Apply to these ${albums.length} CDs (keep pile order):`),
          );
          albums.forEach((a) => card.append(row(a)));
        }
      }
      card.append(
        pile.genre ? tapeLine("TOP", pile.genre) : el("p", "TOP · No tape"),
      );
      screen.append(card);
    }
    screen.append(action("Continue →", () => go(6)));
  } else if (state.stage === 6) {
    title.textContent = plan.piles.length
      ? `Reshelve shelf ${state.target}`
      : "Shelf cleared";
    screen.append(
      el(
        "p",
        plan.piles.length
          ? "Place the stacks into the shelf in this order, left to right."
          : "No CDs to reshelve.",
      ),
    );
    plan.piles.forEach((p, i) => {
      const card = el("div", undefined, "pile-card");
      card.append(
        el("h3", `Pile ${p.number} · ${p.label}`),
        el(
          "p",
          `${p.albums.length} ${p.albums.length === 1 ? "CD" : "CDs"}`,
        ),
      );
      screen.append(card);
    });
    screen.append(
      action("Finish shelf", () => {
        const completed = state.target;
        state = { stage: 0, target: "", scans: [], plan: null, offset: 0 };
        render();
        note(`Shelf ${completed} finished.`);
      }),
    );
  }
  title.focus();
}
function tapeLine(position, genre) {
  const t = W.tape(genre),
    line = el("p", undefined, "tape");
  if (t.color) {
    const swatch = el("span", undefined, "swatch");
    swatch.style.backgroundColor = t.color;
    line.append(swatch);
  }
  line.append(
    el("strong", `${position} · ${t.label}`),
    el("span", t.genre || "Missing genre · set aside for clarification"),
  );
  return line;
}
// On task screens Enter activates the same guarded action as a mouse click.
// Entry forms keep their native Enter behavior for shelf/barcode submission.
document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Enter" ||
    state.stage < 2 ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    event.target.closest("input, textarea, select, a, [contenteditable]")
  ) return;

  const button = screen.querySelector("button:not(.quiet)");
  if (!button || button.disabled) return;
  event.preventDefault(); // Prevent native button activation from firing twice.
  if (!event.repeat) button.click(); // Holding Enter must not skip task screens.
});
window.addEventListener("beforeunload", (e) => {
  if (state.scans.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
render();
