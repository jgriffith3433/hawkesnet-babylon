// The avatars scenario and its parts are wired: the page registers it, the build ships its files, nameplates are billboards
// (no billboardMode, no LookAt), the touch Wave button is at least 44 px, and the playtest gates the criteria numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('example/index.html'), pt = read('example/avatar-playtest.mjs'), demo = read('tools/demo.mjs'), mod = read('hawkes-net-babylon.mjs');

test('the page registers the avatars scenario, in the stub too, and the build ships its modules', () => {
  assert.equal((page.match(/id: 'avatars'/g) || []).length, 2, 'stub list and real scenario');
  for (const f of ['locomotion.mjs', 'avatar-playtest.mjs', 'net-drop-playtest.mjs']) assert.ok(demo.includes(`'${f}'`), `demo build copies ${f}`);
});

test('nameplates are billboards that copy the camera: no billboardMode, no LookAt, no negative scale', () => {
  for (const [name, src] of [['page', page], ['module', mod]]) {
    assert.ok(!/billboardMode\s*=/.test(src), `${name} sets no billboardMode`);
    assert.ok(!/\.lookAt\(|setTarget\(/i.test(src.replace(/cam\.setTarget/g, '')), `${name} has no LookAt on text`);
  }
  assert.ok(!/scaling\.[xyz]\s*=\s*-/.test(mod), 'no negative scale');
  assert.match(mod, /export function billboards/);
});

test('the touch Wave button is a 56 px target that plays the same wave as E', () => {
  assert.match(page, /#wave \{[^}]*width: 56px; height: 56px/);
  assert.match(page, /waveBtn\.addEventListener\('click', \(\) => mp\.emote\('wave'\)\)/);
  assert.match(page, /body\.compact #wave \{ display: block; \}/);
});

test('the playtest gates the criteria numbers', () => {
  assert.match(pt, /FOOT_CM_S_MAX = 5/);
  assert.match(pt, /MIN_TEXT_PX = 12/);
  assert.match(pt, /MIN_TAP_PX = 44/);
  assert.match(pt, /mirroredNameplateFrames/);
  assert.match(pt, /PI \* 2/, 'a full 360-degree orbit');
});
