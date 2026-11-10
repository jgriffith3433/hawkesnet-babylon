// Demo orb game: wired on sync.state / sync.action, exposed for playtest, copied into dist/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('example/index.html', root), 'utf8');
const orbs = fs.readFileSync(new URL('example/orbs.mjs', root), 'utf8');
const play = fs.readFileSync(new URL('example/orbs-playtest.mjs', root), 'utf8');
const bot = fs.readFileSync(new URL('example/net-playtest.mjs', root), 'utf8');
const demo = fs.readFileSync(new URL('tools/demo.mjs', root), 'utf8');
const bible = fs.readFileSync(new URL('docs/world-bible.md', root), 'utf8');

test('the demo wires six orbs on sync.state / sync.action and exposes hawkesBabylonOrbs', () => {
  assert.match(orbs, /ORB_N = 6/);
  assert.match(orbs, /sync\.state\('orbs'/);
  assert.match(orbs, /sync\.action\('orb-touch'/);
  assert.match(orbs, /sync\.action\('orb-award'/);
  assert.match(orbs, /pickWithRay/);
  assert.match(html, /hawkesBabylonOrbs/);
  assert.match(html, /createOrbs/);
  assert.match(html, /afterTwoPlayers/);
  assert.match(html, /orbChecks/);
  assert.match(html, /id="scores"/);
  assert.doesNotMatch(html, /setInterval\([^)]*fetch/);
});

test('orb playtest covers the three acceptance criteria; shared bot stays free of orb logic', () => {
  assert.match(play, /Both players see the same 6 orbs/);
  assert.match(play, /within half a second/);
  assert.match(play, /joins mid-round/);
  assert.match(play, /SCORE_MS = 500/);
  assert.match(bot, /afterTwoPlayers/);
  assert.match(bot, /scene/);
  assert.doesNotMatch(bot, /orb-touch|hawkesBabylonOrbs|orbs-playtest/);
});

test('demo build copies orbs modules; world bible names the orbs', () => {
  assert.match(demo, /orbs\.mjs/);
  assert.match(demo, /orbs-playtest\.mjs/);
  assert.match(bible, /Six glowing orbs|six cyan orbs/i);
  assert.match(bible, /score/);
});
