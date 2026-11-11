# Hawkes Net for Babylon.js

Multiplayer for a Babylon.js scene in a few lines, on **[Hawkes Net](https://net.hawkesgen.ai)**: a shared room per
area, everyone else drawn as an avatar and played back smoothly, your player's place sent each frame, shared moving things
simulated by one player at a time, and players whose tab is in the background shown as away (an away host hands the room
on). No server of your own.

```bash
npm install https://github.com/jgriffith3433/hawkesnet-babylon/archive/refs/tags/v0.1.2.tar.gz @babylonjs/core
```

(It brings `@hawkesgen/net` with it. Once they're on npm: `npm install @hawkesgen/net-babylon @babylonjs/core`.) On a staging
site, set `globalThis.HAWKES_NET_ENDPOINT` to point the whole scene at another Hawkes Net.

## Quickstart: a blank page, copy and paste

Save this as `index.html`, serve the folder (`npx serve .`, or any static server: modules need http, not `file://`) and open
it in two tabs. WASD moves the ball; the other tab shows it as a capsule with your name, played back smoothly. It joins the
free test room of the `netdemo` project, so it needs no account and no key.

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>html, body, canvas { margin: 0; width: 100%; height: 100%; display: block; background: #0e1116; }</style>
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script type="importmap">
{ "imports": {
  "@hawkesgen/net": "https://net.hawkesgen.ai/sdk/hawkes-net@1.mjs",
  "@hawkesgen/net-babylon": "https://cdn.jsdelivr.net/gh/jgriffith3433/hawkesnet-babylon@main/hawkes-net-babylon.mjs"
} }
</script>
</head>
<body>
<canvas id="c"></canvas>
<script type="module">
  import { multiplayer } from '@hawkesgen/net-babylon';

  const engine = new BABYLON.Engine(document.getElementById('c'), true);
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1, 18, BABYLON.Vector3.Zero(), scene);
  new BABYLON.HemisphericLight('sun', new BABYLON.Vector3(0.3, 1, 0.2), scene);
  BABYLON.MeshBuilder.CreateGround('floor', { width: 30, height: 30 }, scene);

  const me = BABYLON.MeshBuilder.CreateSphere('me', { diameter: 1 }, scene);
  me.position.y = 0.5;
  const keys = {};
  addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  const mp = multiplayer(scene, {
    babylon: BABYLON,
    project: 'netdemo',            // the free demo project; use your own from net.hawkesgen.ai
    name: 'Player ' + Math.floor(Math.random() * 100),
    player: me,                    // your place and heading go out about 20 times a second
    area: 'quickstart',            // the shared room
  });
  mp.on('chat', (text, from) => console.log(from.name + ': ' + text));
  mp.when('status', (s) => console.log('status', s));

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    me.position.x += ((keys.d ? 1 : 0) - (keys.a ? 1 : 0)) * 6 * dt;
    me.position.z += ((keys.w ? 1 : 0) - (keys.s ? 1 : 0)) * 6 * dt;
    scene.render();
  });
  addEventListener('resize', () => engine.resize());
</script>
</body>
</html>
```

Press **E** to wave. In the console, `mp.send('chat', 'hi')` shows up in the other tab. For a bundler instead, install the
package (above) and import from `@babylonjs/core`, `@hawkesgen/net-babylon`; the same code works with `babylon: BABYLON`
from `import * as BABYLON from '@babylonjs/core'`. Pin a release in the page by replacing `@main` with a tag (`@v0.2.0`).

### In your own game

```js
import * as BABYLON from '@babylonjs/core';
import { multiplayer } from '@hawkesgen/net-babylon';

const mp = multiplayer(scene, {
  babylon: BABYLON,
  project: 'my-game',            // your project at net.hawkesgen.ai
  name: 'Ada',
  player: playerMesh,
  liveHosts: ['mygame.com'],     // your site: the live rooms; anywhere else (localhost, a preview) the free test rooms
});

mp.on('chat', (text, from) => console.log(from.name, text));
mp.send('chat', 'hi');
mp.share(crateMesh, 'crate-1');  // the host simulates it; everyone sees it move
const ball = mp.share(ballMesh, 'ball', { owner: 'claim' });
ball.take();                     // the player who grabbed it simulates it now
```

## API notes

Everything below is exported from `@hawkesgen/net-babylon` (types in `hawkes-net-babylon.d.ts`). The default export is an
object holding the same names.

| Export | What it is |
| --- | --- |
| `multiplayer(scene, options)` | Starts multiplayer on a Babylon scene and returns a `Multiplayer` (below). |
| `defaultAvatar(peer, BABYLON, scene)` | The default avatar: a capsule in the player's color with their name over it. Call it from your own `avatar` to extend it. |
| `playEmote(node, 'wave', BABYLON, scene)` | Puts an emote (a swinging raised arm) on any node. Returns `{ kind, done, update(now), dispose() }`; `multiplayer()` drives its own, otherwise call `update(performance.now())` each frame. |
| `billboards(scene, BABYLON, { textPx })` | Nameplates that read the right way round from every side: each frame, meshes with `metadata.hnBillboard` copy the camera's rotation (no `LookAt`, no negative scale) and keep about `textPx` (22) CSS pixels of text on screen. `multiplayer()` and `defaultAvatar` use it; returns `off()`. |
| `background`, `inBackground` | Re-exported from `@hawkesgen/net`. `background(fn)` keeps `fn` running while the tab is hidden; `inBackground()` says whether it is. |
| `VERSION` | This package's version string. |
| `default` | `{ multiplayer, defaultAvatar, playEmote, billboards, background, inBackground, VERSION }`. |

**`multiplayer(scene, options)`** takes the SDK's lobby options (`endpoint`, ...) plus:

| Option | Meaning |
| --- | --- |
| `babylon` | The `BABYLON` namespace. Default `globalThis.BABYLON`; pass it when you import `@babylonjs/core`. |
| `project` | Your Hawkes Net project (required). |
| `name` | Your player's name, shown over the avatar. |
| `area` | The shared room (default `'lobby'`). |
| `liveHosts` | Your site(s): there players share the live rooms; anywhere else the free test rooms. |
| `player` | The mesh or node whose place and heading are sent. Or give `getPose: () => ({ position, yaw?, extra? })`. |
| `avatar` | `(peer, BABYLON, scene) => node`: how others look (`peer.extra` has the values that player sends in their pose extra, e.g. a colour). |
| `onAway` | `(node, away, peer) => void`: show "away" your own way (a nameplate); the module fades an away avatar to 40% itself. A dropped player is away at once and removed with the leave fade after the server's 15 s grace. |
| `emoteArm` | `true` (default): a wave is a raised arm on the avatar. `false`: your own avatar plays its wave clip when `onPresence` reports an `emote` (the demo does this with a rigged robot). |
| `emoteKeys` | Key presses that emote (default `{ e: 'wave' }`, `false` for none). |

An option given as `undefined` is ignored (the SDK's default stays).

**The `Multiplayer` it returns**

| Member | Meaning |
| --- | --- |
| `peers` | Everyone else, by id: `{ id, name, away, node }`. |
| `room`, `lobby`, `ready`, `isHost` | The SDK's room (`mp.room.now()` is the shared clock), its lobby, whether you are in, whether you host. |
| `send(kind, data?, opt?)` / `on(kind, fn)` | Messages to the room; `on` returns an off function. |
| `when(event, fn)` | Lobby events, e.g. `'status'`, `'peer:join'`, `'peer:leave'`. |
| `join(area)` | Move to another area's room. |
| `share(node, id, { owner? })` | A moving thing everyone sees. `owner: 'host'` (default) or `'claim'`. Returns `{ take(), release(), mine() }`. |
| `unshare(id)` | Stop sharing it. |
| `emote('wave')` | Wave on your player (false inside a short cooldown). |
| `onPresence(fn)`, `presence`, `leaving` | Join, leave, emote and away events (`spawn`, `leave`, `emote`, `away`, `back`), the last 50, and avatars fading out. |
| `dispose()` | Leave and remove every avatar and hook. |

The demo site also serves your quickstart as `quickstart.html`, built from the code block above (`npm run build`), so it can't drift; the demo's `quickstart` playtest scenario opens it.

**Try it with no install:** serve this folder (`node tools/serve.mjs`), open http://localhost:8796/example/ twice, move with
WASD. It loads Babylon from its CDN and the SDK from net.hawkesgen.ai, and joins the demo project's test room.
The demo is also a small game-feel reference: the capsule accelerates and brakes (it does not snap to full speed), the
camera eases after it, and on a touch device (or with `?touch=1`) an on-screen joystick appears and drives the same
movement. Its `feel` playtest scenario checks all three with real key and pointer input. The `phone` scenario runs at
390×844 with touch: it drags the stick (character moves that way), asserts the Sound button stays off the joystick ring,
keeps the info panel to one line, and checks no sideways scroll and text at least 12 px.

**Getting in:** make a free account and a project at [net.hawkesgen.ai](https://net.hawkesgen.ai). Pages on your
project's sites join with no key; localhost always may, in test rooms. A game with its own server can hand out tickets
instead (see the SDK's README).

`npm test` runs two Babylon scenes (NullEngine) against a Hawkes Net started in the test (a
[hawkesnet](https://net.hawkesgen.ai) checkout beside this one, or `HAWKESNET=<path>`).

License: [MIT](LICENSE).

## Credits

The demo's character, `example/assets/robot.glb`, is RobotExpressive by Tomás Laulhé (Quaternius), CC0 (https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive).
