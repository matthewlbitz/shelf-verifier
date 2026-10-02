# KTRU Shelf Verifier

Standalone Express + better-sqlite3 + plain browser JavaScript. `masterAlbums.db`
stays beside `server.js`; the app opens it read-only and never changes the catalog.

## Start on macOS or Windows PowerShell

Use Node.js 24 LTS (Node 22+ supported). In this project folder:

```
npm install
npm start
```

Open http://localhost:3002. `npm test` runs the built-in Node test runner;
no build step or extra testing dependencies are needed. If the port is occupied,
macOS: `PORT=3003 npm start`; PowerShell: `$env:PORT=3003; npm start`.
Install dependencies on each computer rather than copying `node_modules` between
macOS and Windows, because better-sqlite3 contains a native module.

## Marina's workflow

1. Validate a target shelf against catalog `rainbow_albums.final_shelf`.
2. Scan physical CDs left to right, placing each CD on top of one stack after
   its lookup completes. Unknown barcodes are retained by barcode and assigned
   to Pile 2; the return stage shows “Set aside”. Ambiguous barcodes and failed
   server/network requests require a retry or catalog correction and are not
   silently treated as unknown albums.
   Remove Last Scanned also means removing the physical top CD. Only the newest
   seven accepted scans are displayed. Catalog count is context, not a required
   scan total: physical shelves can have missing or misplaced CDs.
3. Process the scanned stack top to bottom into Pile 1 (belongs here) and Pile 2
   (belongs elsewhere). Every destination receives CDs on its top. Confirm each
   displayed batch only after moving those CDs; final batches may have fewer than ten.
4. Return Pile 2 top to bottom to the displayed destinations. Blank destinations
   show “Set aside”; no shelf is invented. Labels outside the catalog stack
   format (a number followed by one letter, e.g. 19E) also show “Set aside”.
5. Process Pile 1 top to bottom into NEW secondary genre piles. Pile 1 is reserved
   for no secondary genre even when empty; named genres follow alphabetically.
   Case and known tape-schema aliases are normalized. Make the indicated physical
   transfer even when there is only one destination pile.
6. Tape the piles without changing stack order. Bottom tape uses each CD's primary
   genre, top tape uses the pile's secondary genre. Mixed primary genres list the
   affected CDs separately. Missing/unknown genres say “Check genre”; do not guess
   a color. No secondary genre means no top tape.
7. Reshelve nonempty piles in displayed order, left to right. Within each pile,
   take the BOTTOM CD first and work upward. Finish resets the in-memory session.

## Ordering contract and scope

`public/workflow.js` contains the pure model used by the UI and tests. Stack arrays
are always top to bottom. `transfer` models sequential placement onto destination
tops. Scanning builds the first stack; each of the two physical sorts reverses
its destination subsequence. Final bottom-first reshelving restores the original
left-to-right relative order within each secondary genre, grouped by secondary
genre (blank first). It does not invent an artist/title sorting rule.

`public/app.js` handles stages, DOM rendering and queued scan lookups. Database
strings enter the page through textContent, never HTML templates. Scan requests
commit in submission order; duplicate barcodes are rejected and scan completion
and removal are disabled while lookups are pending. Brief action guards prevent
a double-click from skipping a batch. Navigation away prompts during a session.

`server.js` exposes only two GET lookups, uses prepared statements, keeps leading
barcode zeros, and rejects ambiguous catalog barcodes rather than choosing a CD.
Shelves with zero assigned catalog records cannot be distinguished from unknown
shelves with this schema and are rejected with an explanatory message.

Session progress is in memory and is lost on a reload/server/browser restart.
Album, case and review verification remain implicit. The app does not check for
missing shelf albums or rewrite catalog data. The visual theme follows the local
KTRU final-sorter and shelf-lookup apps.
