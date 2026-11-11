// Round logic (example/rounds.mjs) on fake rooms and a fake orb game: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRounds, RESULT_MS, ALONE_MS, fmtClock } from '../example/rounds.mjs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('example/index.html', root), 'utf8');
const demo = fs.readFileSync(new URL('tools/demo.mjs', root), 'utf8');

function fakeRoom(id, isHost, peers = []) {
  const states = new Map();
  const room = {
    id, name: id, isHost, status: 'online', peers: new Map(peers.map((p) => [p, { id: p, name: p }])),
    sync: { state: (n, d) => states.set(n, d) },
    states,
  };
  room.net = room;
  return room;
}

function fakeOrbs(room) {
  const g = { scores: {}, frozen: false, orbs: [{ id: 'o0', x: 6, z: 0, gen: 1 }], collected: [] };
  return {
    g, obstacles: [{ x: 3, z: 3, r: 1.6 }],
    snapshot: () => ({ orbs: g.orbs.map((o) => ({ ...o })), scores: { ...g.scores } }),
    setFrozen: (_n, on) => { g.frozen = on; }, resetScores: () => { g.scores = {}; },
    dropScores: (_n, pred) => { for (const k of Object.keys(g.scores)) if (pred(k)) delete g.scores[k]; },
    collectFor: (_n, by, orbId) => { if (g.frozen) return false; g.scores[by] = (g.scores[by] || 0) + 1; g.collected.push([by, orbId]); return true; },
  };
}

const origNow = performance.now.bind(performance);
function clock() {
  let t = 1000;
  performance.now = () => t;
  return { adv: (ms, step = 50) => { for (let i = 0; i < ms; i += step) { t += step; globalThis.__tick(t); } }, restore: () => { performance.now = origNow; } };
}

test('a 60 s round ends with one result, holds it for 3 s, then resets scores', () => {
  const c = clock();
  try {
    const room = fakeRoom('me', true, ['bob']);
    const orbs = fakeOrbs(room);
    const rounds = createRounds({ BABYLON: {}, scene: {}, orbs });
    globalThis.__tick = (t) => rounds.tick(t);
    rounds.attachMain(room);
    rounds.tick(performance.now());
    assert.equal(rounds.snapshot(room).len, 60000);
    assert.equal(rounds.snapshot(room).n, 1);
    orbs.g.scores = { bob: 3, me: 1 };
    c.adv(30000);
    assert.ok(rounds.snapshot(room).left <= 30500 && rounds.snapshot(room).left >= 29000);
    c.adv(30500);
    let s = rounds.snapshot(room);
    assert.equal(s.phase, 'result');
    assert.equal(s.result.text, 'bob wins!');
    assert.deepEqual(s.result.board.map((r) => r.score), [3, 1]);
    assert.equal(orbs.g.frozen, true);
    c.adv(RESULT_MS + 200);
    s = rounds.snapshot(room);
    assert.equal(s.phase, 'play');
    assert.equal(s.n, 2);
    assert.deepEqual(orbs.g.scores, {});
    assert.equal(orbs.g.frozen, false);
  } finally { c.restore(); }
});

test('a client takes the same timer and result from the host state', () => {
  const c = clock();
  try {
    const host = fakeRoom('h', true, ['c']);
    const orbs = fakeOrbs(host);
    const hr = createRounds({ BABYLON: {}, scene: {}, orbs });
    globalThis.__tick = (t) => hr.tick(t);
    hr.attachMain(host); hr.tick(performance.now());
    c.adv(61000);
    assert.equal(hr.snapshot(host).phase, 'result');
    const client = fakeRoom('c', false, ['h']);
    const cr = createRounds({ BABYLON: {}, scene: {}, orbs: fakeOrbs(client) });
    cr.attachMain(client);
    client.states.get('round').set(host.states.get('round').get());
    assert.deepEqual(cr.snapshot(client).result, hr.snapshot(host).result);
    assert.equal(cr.snapshot(client).phase, 'result');
  } finally { c.restore(); }
});

test('alone for 3 s: two bots; they find orbs; a real player makes them leave', () => {
  const c = clock();
  try {
    const room = fakeRoom('me', true, []);
    const orbs = fakeOrbs(room);
    const rounds = createRounds({ BABYLON: {}, scene: {}, orbs });
    globalThis.__tick = (t) => rounds.tick(t);
    rounds.attachMain(room);
    rounds.tick(performance.now());
    c.adv(ALONE_MS - 400);
    assert.equal(rounds.snapshot(room).bots.length, 0);
    c.adv(800);
    assert.equal(rounds.snapshot(room).bots.length, 2);
    c.adv(9000);
    assert.ok(orbs.g.collected.length > 0, 'a bot collects within 9 s');
    assert.ok(Object.keys(orbs.g.scores).every((k) => k.startsWith('bot-')));
    const bots = rounds.snapshot(room).bots;
    for (const b of bots) assert.ok(Math.hypot(b.x - 3, b.z - 3) > 0.8, 'a bot never stands in the crate');
    room.peers.set('ann', { id: 'ann', name: 'Ann' });
    c.adv(100);
    assert.equal(rounds.snapshot(room).bots.length, 0);
    assert.deepEqual(orbs.g.scores, {});
  } finally { c.restore(); }
});

test('the clock format and the page wiring', () => {
  assert.equal(fmtClock(60000), '1:00');
  assert.equal(fmtClock(9100), '0:10');
  assert.equal(fmtClock(0), '0:00');
  assert.match(html, /id="timer"/);
  assert.match(html, /id="roundResult"/);
  assert.match(html, /createRounds/);
  assert.match(html, /q\.get\('round'\)/);
  assert.match(html, /id: 'round'/);
  assert.match(html, /env\(safe-area-inset-top\)\) \+ 40px/);
  assert.match(demo, /rounds\.mjs/);
  assert.match(demo, /rounds-playtest\.mjs/);
});
