# Hawkes Net for Babylon.js

Multiplayer for a Babylon.js scene in a few lines, on **[Hawkes Net](https://net.hawkesgen.com)**: a shared room per
area, everyone else drawn as an avatar and played back smoothly, your player's place sent each frame, shared moving things
simulated by one player at a time, and players whose tab is in the background shown as away (an away host hands the room
on). No server of your own.

```bash
npm install github:jgriffith3433/hawkesnet-babylon#v0.1.1 @babylonjs/core
```

(It brings `@hawkesgen/net` with it. Once they're on npm: `npm install @hawkesgen/net-babylon @babylonjs/core`.) On a staging
site, set `globalThis.HAWKES_NET_ENDPOINT` to point the whole scene at another Hawkes Net.

```js
import * as BABYLON from '@babylonjs/core';
import { multiplayer } from '@hawkesgen/net-babylon';

const mp = multiplayer(scene, {
  babylon: BABYLON,
  project: 'my-game',            // your project at net.hawkesgen.com
  name: 'Ada',
  player: playerMesh,            // your place and heading go out about 20 times a second
  liveHosts: ['mygame.com'],     // your site: the live rooms; anywhere else (localhost, a preview) the free test rooms
});

mp.on('chat', (text, from) => console.log(from.name, text));
mp.send('chat', 'hi');
mp.share(crateMesh, 'crate-1');  // the host simulates it; everyone sees it move
const ball = mp.share(ballMesh, 'ball', { owner: 'claim' });
ball.take();                     // the player who grabbed it simulates it now
```

- **Avatars:** `avatar: (peer, BABYLON, scene) => node` draws others your way (default: a capsule in their color with
  their name). `mp.peers` has everyone: `{ id, name, away, node }`.
- **Rooms by area:** `area: 'level-1'`, `mp.join('level-2')`. Full rooms spill into the next shard; a lost connection
  rejoins by itself (`mp.when('status', ...)`).
- **In the background:** a hidden player's avatar is drawn faded; `background(fn)` (re-exported from the SDK) keeps your
  game's step running while the tab is hidden, for games others wait on.
- **Everything else** in the SDK is there: `mp.room` is a [`@hawkesgen/net`](https://www.npmjs.com/package/@hawkesgen/net)
  room (express frames, synced state, the shared clock `mp.room.now()`).

**Try it with no install:** serve this folder (`node tools/serve.mjs`), open http://localhost:8796/example/ twice, move with
WASD. It loads Babylon from its CDN and the SDK from net.hawkesgen.com, and joins the demo project's test room.

**Getting in:** make a free account and a project at [net.hawkesgen.com](https://net.hawkesgen.com). Pages on your
project's sites join with no key; localhost always may, in test rooms. A game with its own server can hand out tickets
instead (see the SDK's README).

`npm test` runs two Babylon scenes (NullEngine) against a Hawkes Net started in the test (a
[hawkesnet](https://net.hawkesgen.com) checkout beside this one, or `HAWKESNET=<path>`).

License: [MIT](LICENSE).
