// Two Babylon scenes (NullEngine) in one test room on a Hawkes Net started in this process (a hawkesnet checkout:
// HAWKESNET, default ../hawkesnet): A's player moves and B's avatar of A follows it; the host moves a shared crate and B
// sees it move; A goes away and B's avatar of A fades; leaving removes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as BABYLON from '@babylonjs/core';
import { multiplayer } from '../hawkes-net-babylon.mjs';

const net = process.env.HAWKESNET ?? path.resolve(import.meta.dirname, '..', '..', 'hawkesnet');
const { startTestHub } = await import(pathToFileURL(path.join(net, 'test', 'helper.ts')).href);
const hub = await startTestHub();
test.after(async () => { await hub.stop(); });

const wait = async (pred, ms = 8000, what = 'condition') => {
  const until = Date.now() + ms;
  for (;;) { if (pred()) return; if (Date.now() > until) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 20)); }
};
function world(name) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 5, -10), scene);
  const player = BABYLON.MeshBuilder.CreateBox(`${name}-player`, { size: 1 }, scene);
  const crate = BABYLON.MeshBuilder.CreateBox(`${name}-crate`, { size: 0.5 }, scene);
  const timer = setInterval(() => scene.render(), 16);
  const mp = multiplayer(scene, { babylon: BABYLON, project: 'netdemo', endpoint: hub.endpoint, name, player, area: `babylon-${process.pid}`, leaveOnHide: false, log: false });
  const shared = mp.share(crate, 'crate-1');
  return { engine, scene, player, crate, mp, shared, stop: () => { clearInterval(timer); mp.dispose(); engine.dispose(); } };
}

test('two Babylon scenes: avatars follow, a shared crate moves for everyone, away fades, leaving removes', async () => {
  const a = world('Ada');
  await wait(() => a.mp.ready, 8000, 'Ada in the room');
  const b = world('Bo');
  try {
    await wait(() => b.mp.ready && a.mp.peers.size === 1 && b.mp.peers.size === 1, 8000, 'both see each other');
    assert.equal(a.mp.isHost, true, 'the first in hosts');
    a.player.position.set(3, 0, 4);
    a.player.rotation.y = 1.2;
    const av = () => b.mp.peers.values().next().value?.node;
    await wait(() => av() && Math.abs(av().position.x - 3) < 0.05 && Math.abs(av().position.z - 4) < 0.05, 8000, "B's avatar of Ada at her place");
    assert.ok(Math.abs(av().rotation.y - 1.2) < 0.05, 'and facing her way');
    assert.equal(b.mp.peers.values().next().value.name, 'Ada', 'with her name');

    // The host (Ada) simulates the crate: Bo's copy follows.
    a.crate.position.set(-2, 1, 5);
    await wait(() => Math.abs(b.crate.position.x + 2) < 0.05 && Math.abs(b.crate.position.z - 5) < 0.05, 8000, "Bo's crate where Ada's is");
    // Bo takes it (he grabbed it): now Ada's copy follows his.
    assert.equal(b.shared.take(), true);
    await wait(() => a.mp.room.sync.mine('crate-1') === false, 4000, 'Ada hears Bo took it');
    b.crate.position.set(6, 0, -1);
    await wait(() => Math.abs(a.crate.position.x - 6) < 0.05, 8000, "Ada's crate where Bo put it");

    a.mp.room.setAway(true);
    await wait(() => av()?.getChildMeshes()[0]?.visibility < 0.5, 4000, "Ada's avatar faded for Bo");
    a.mp.room.setAway(false);
    await wait(() => av()?.getChildMeshes()[0]?.visibility === 1, 4000, 'and back');

    a.stop();
    await wait(() => b.mp.peers.size === 0, 30000, 'Ada gone for Bo');
    assert.equal(b.scene.getMeshByName('hn-body-' + a.mp.room?.id), null);
  } finally { b.stop(); try { a.stop(); } catch { /* stopped */ } }
});
