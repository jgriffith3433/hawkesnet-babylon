import test from 'node:test';
import assert from 'node:assert/strict';
import { throttlePoses, measureJump, MAX_JUMP_M } from '../example/net-drop-playtest.mjs';

test('throttlePoses holds poses for the latency and drops the lossy share, then restores', async () => {
  const got = [];
  const b = { pose: (p) => got.push(p) };
  const orig = b.pose;
  let n = 0;
  const restore = throttlePoses(b, { latencyMs: 40, loss: 0.05, rnd: () => (n++ % 20 === 0 ? 0 : 0.5) });
  for (let i = 0; i < 40; i++) b.pose(i);
  assert.equal(got.length, 0, 'nothing arrives before the latency');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(restore.stats.dropped, 2);
  assert.equal(got.length, 38);
  assert.deepEqual(got, got.slice().sort((a, b2) => a - b2), 'in order');
  restore();
  assert.equal(b.pose, orig);
});

test('measureJump reports the largest per-frame step and fails a jump over the limit by value', async () => {
  const frames = [];
  let p = [0, 0, 0];
  const onFrame = (f) => { frames.push(f); return () => frames.splice(frames.indexOf(f), 1); };
  const res = await measureJump({ onFrame, pos: () => p, run: async () => {
    for (const x of [0.1, 0.2, 0.9, 1.0]) { p = [x, 0, 0]; frames.forEach((f) => f()); }
  } });
  assert.ok(Math.abs(res.max - 0.7) < 1e-9);
  assert.ok(res.max > MAX_JUMP_M);
  assert.equal(frames.length, 0);
});
