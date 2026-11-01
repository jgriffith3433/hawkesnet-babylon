# hawkesnet-babylon — agent guide

`@hawkesgen/net-babylon` (public, MIT, since 2026-10-26): multiplayer for Babylon.js scenes on Hawkes Net, a thin layer
over `@hawkesgen/net` (the hawkesnet repo's `sdk/js`). One file, `hawkes-net-babylon.mjs`, and its types `hawkes-net-babylon.d.ts`.

- **Babylon is passed in** (`babylon: BABYLON`), never imported: games use `@babylonjs/core` ES modules or the global
  build. Keep it that way (and `@babylonjs/core` an optional peer).
- **Everything rides the SDK:** rooms are its `lobby()`, playback its `Track` on the room's clock, shared things its
  `room.sync` (`mine`, `claim`, `push`, `onThing`). A feature the SDK lacks goes into the SDK (hawkesnet), not here.
- Options given as `undefined` are dropped before they reach the SDK (they would override its defaults).
- `npm test`: two scenes on NullEngine against a Hawkes Net started in the test from a hawkesnet checkout (`HAWKESNET`,
  default `../hawkesnet`); `npm install` brings `@hawkesgen/net` from the public hawkesnet-js repo by tag (package.json); a new SDK is a tag bump there.
- `example/` runs with no install (`node tools/serve.mjs`), on the live service's free test rooms.
- Release: bump `version` (and `VERSION` in the module), tag `v<version>`, `npm publish --access public`.
- **Demo site:** `npm run build` makes `dist/`: the example page with this module and the pinned `@hawkesgen/net` beside it
  (`tools/demo.mjs`), plus the package tarball. Hawkes Studio (project hawkes-net-babylon) builds it on every beta push,
  publishes it as the beta site and playtests it there; Studio's beta pages set `HAWKES_NET_ENDPOINT` to beta Hawkes Net
  (https://hawkesnet.hawkesgen.ai), so the demo joins beta Net's free test rooms (project `netdemo`).
  The page has Studio's playtest bot (`example/net-playtest.mjs`, `window.hawkesPlaytest`): `smoke` opens a second
  player in the same page and checks the room, avatars both ways (the capsule moved by real WASD input), messages both
  ways and leaving; `two-players` is for Studio's peers playtest (real browsers on one `?room=`). The same file lives in
  hawkesnet-js and hawkesnet (`public/demo-playtest.mjs`): change all three.
