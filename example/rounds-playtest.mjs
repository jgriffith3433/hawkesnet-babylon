// Round checks for the Babylon demo (rounds.mjs): the 60 s timer, bots for a lone visitor, the shared result after 0.
// Wired from example/index.html as the `round` scenario; kept out of the shared net-playtest.mjs (same pattern as orbs-playtest.mjs).

import { ROUND_SECONDS, RESULT_MS } from './rounds.mjs';

function api() {
  const r = typeof window !== 'undefined' ? window.hawkesBabylonRounds : null;
  const o = typeof window !== 'undefined' ? window.hawkesBabylonOrbs : null;
  if (!r || !o) throw new Error('the demo has no hawkesBabylonRounds / hawkesBabylonOrbs API');
  return { rounds: r, orbs: o };
}

const sortedDesc = (board) => board.every((r, i) => i === 0 || board[i - 1].score >= r.score);

/**
 * `main` is the page's own lobby (player A). `openBot` opens a second real player (B). `short` is the short round
 * (seconds) used for the end-of-round part so the scenario does not sit through a whole minute.
 */
export async function roundChecks({ check, main, openBot, until, wait, metric, event = () => {}, scene: setScene = () => {}, progress = () => {}, short = 10 }) {
  const { rounds, orbs } = api();
  const timerEl = document.getElementById('timer');
  const cardEl = document.getElementById('roundResult');
  await until(() => (main?.ready || main?.room?.status === 'online') && rounds.snapshot(main).n >= 1, 20000, 'the host to start round 1');
  const alone = main.peers.size === 0;
  const timerSecs = () => Number(timerEl.dataset.left);

  await check('A 60-second timer counts down at the top of the screen', async () => {
    const s = rounds.snapshot(main);
    if (s.len !== ROUND_SECONDS * 1000) throw new Error(`the round is ${s.len / 1000} s long, not ${ROUND_SECONDS}`);
    const r = timerEl.getBoundingClientRect();
    if (r.width < 20 || r.top > 80 || r.bottom < 0) throw new Error(`the timer is not at the top (top ${Math.round(r.top)}, ${Math.round(r.width)} px wide)`);
    const mid = (r.left + r.right) / 2;
    if (Math.abs(mid - innerWidth / 2) > innerWidth * 0.08) throw new Error(`the timer is not centred (middle at ${Math.round(mid)} of ${innerWidth})`);
    const a = rounds.snapshot(main).left, t0 = timerSecs();
    await wait(2200);
    const b = rounds.snapshot(main).left, t1 = timerSecs();
    if (!(a - b >= 1800)) throw new Error(`the clock moved ${a - b} ms in 2.2 s`);
    if (!(t1 < t0)) throw new Error(`the timer on screen did not count down (${t0} → ${t1})`);
    metric('roundSeconds', s.len / 1000);
    event('timer', `round ${s.n}: ${timerEl.textContent.replace(/\s+/g, ' ')} at top centre, counting down (${t0}s → ${t1}s)`);
    setScene('Round timer');
    return `${s.len / 1000} s round, timer at top centre reads ${t1}s and is counting down`;
  });
  progress(0.15);

  if (alone) {
    await check('A visitor alone sees 2 bots within 5 s', async () => {
      const ms = await until(() => rounds.snapshot(main).bots.length === 2 && rounds.botNodes().length === 2, 8000, 'two bots to appear for a lone visitor');
      metric('botsAppearMs', Math.round(ms));
      if (ms > 5000) throw new Error(`the bots took ${Math.round(ms)} ms`);
      const s = rounds.snapshot(main);
      for (const n of rounds.botNodes()) if (Math.abs(n.position.y) > 0.05) throw new Error(`a bot floats ${n.position.y.toFixed(2)} m off the floor`);
      event('bots', `${s.bots.map((b) => b.name).join(', ')} stand on the court`);
      setScene('Round bots');
      return `${s.bots.length} bots (${s.bots.map((b) => b.name).join(', ')}) after ${Math.round(ms)} ms`;
    });
    await check('A bot collects an orb within 30 s', async () => {
      const ms = await until(() => Object.entries(orbs.snapshot(main).scores).some(([k, v]) => k.startsWith('bot-') && v > 0), 30000, 'a bot to collect an orb');
      const sc = orbs.snapshot(main).scores;
      metric('botFirstCollectMs', Math.round(ms));
      event('bot-collect', `a bot scored (${JSON.stringify(sc)}) ${Math.round(ms)} ms in`);
      setScene('Round bot collect');
      return `a bot scored after ${Math.round(ms)} ms`;
    });
  } else {
    event('not-alone', `${main.peers.size} other player(s) in the room: the bot checks are skipped`);
  }
  progress(0.4);

  let bot = null;
  try {
    bot = await openBot();
    await until(() => bot && (bot.ready || bot.room?.status === 'online') && main.peers.has(bot.id), 15000, 'player B to join');
    rounds.wire(bot); orbs.wire(bot);
    if (alone) {
      await check('The bots leave when a real player joins', async () => {
        const ms = await until(() => rounds.snapshot(main).bots.length === 0 && rounds.botNodes().length === 0 && rounds.snapshot(bot).bots.length === 0, 6000, 'the bots to leave');
        metric('botsLeaveMs', Math.round(ms));
        return `bots gone ${Math.round(ms)} ms after B joined`;
      });
    }
    progress(0.5);

    // The setup shortcut: a short round so the end of a round can be played to in seconds.
    if (!rounds.configure(short)) throw new Error('this page is not the host, so it cannot set a short round');
    await until(() => rounds.snapshot(bot).len === short * 1000 && rounds.snapshot(bot).n === rounds.snapshot(main).n, 8000, 'B to see the short round');
    const startN = rounds.snapshot(main).n;
    event('short-round', `round ${startN} runs ${short} s`);

    // B collects an orb by the same path as walking into it (pose, then the page's own touch check) so there is a clear winner.
    const target = orbs.snapshot(main).orbs[0];
    for (let i = 0; i < 40; i++) {
      const u = (i + 1) / 40, x = target.x - 2.5 + 2.5 * u;
      bot.pose([x, 0, target.z], 0);
      if (Math.hypot(x - target.x, target.z - target.z) <= 1.1) orbs.touchAt(bot, x, target.z);
      await wait(25);
      if ((orbs.snapshot(main).scores[bot.id] || 0) > 0) break;
    }
    await until(() => (orbs.snapshot(main).scores[bot.id] || 0) > 0 && (orbs.snapshot(bot).scores[bot.id] || 0) > 0, 4000, 'B to score on both screens');

    let sawPulse = false;
    await check('The timer pulses in the last 10 seconds', async () => {
      await until(() => {
        sawPulse = sawPulse || timerEl.classList.contains('pulse');
        return rounds.snapshot(main).left <= 4000;
      }, short * 1000 + 3000, 'the round to near its end');
      if (!sawPulse && !timerEl.classList.contains('pulse')) throw new Error('the timer never pulsed in the last 10 s');
      event('pulse', `timer pulsing at ${timerEl.dataset.left}s`);
      return `pulsing (${timerEl.dataset.left}s left)`;
    });
    progress(0.7);

    let seenA = null, seenB = null;
    await check('At 0 both tabs show the same winner and a sorted scoreboard', async () => {
      await until(() => rounds.snapshot(main).phase === 'result' && rounds.snapshot(bot).phase === 'result' && rounds.snapshot(main).result && rounds.snapshot(bot).result,
        (short + 6) * 1000, 'the round to end on both tabs');
      seenA = rounds.snapshot(main); seenB = rounds.snapshot(bot);
      const a = JSON.stringify(seenA.result), b = JSON.stringify(seenB.result);
      if (a !== b) throw new Error(`the two tabs disagree: ${a} vs ${b}`);
      if (!sortedDesc(seenA.result.board)) throw new Error(`the scoreboard is not sorted: ${seenA.result.board.map((r) => r.score).join(',')}`);
      if (!seenA.result.winners.includes(bot.id)) throw new Error(`the winner should be B (${bot.id}), got ${seenA.result.text}`);
      await until(() => !cardEl.hidden && cardEl.textContent.includes(seenA.result.text.replace(/ wins!$/, '')), 2000, 'the result card on screen');
      const r = cardEl.getBoundingClientRect();
      if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) throw new Error('the result card runs off the screen');
      await until(() => rounds.confettiCount > 0, 1500, 'confetti');
      metric('resultConfetti', rounds.confettiCount);
      event('round-result', `${seenA.result.text} board ${seenA.result.board.map((x) => `${x.name} ${x.score}`).join(', ')} (same on both tabs)`);
      setScene('Round result');
      await wait(1000);   // the card stays: let the runner screenshot it
      if (cardEl.hidden) throw new Error('the result card vanished before 1 s');
      return `${seenA.result.text} Board: ${seenA.result.board.map((x) => `${x.name} ${x.score}`).join(', ')}`;
    });

    await check('Then a new round starts with scores reset', async () => {
      const t0 = performance.now();
      await until(() => rounds.snapshot(main).phase === 'play' && rounds.snapshot(main).n === startN + 1 && rounds.snapshot(bot).n === startN + 1, RESULT_MS + 4000, 'the next round to start');
      const gap = Math.round(performance.now() - t0);
      await until(() => Object.values(orbs.snapshot(main).scores).every((v) => !v) && Object.values(orbs.snapshot(bot).scores).every((v) => !v), 3000, 'scores to reset on both tabs');
      if (!cardEl.hidden) throw new Error('the result card is still up in the new round');
      const s = rounds.snapshot(main);
      event('new-round', `round ${s.n} started, ${Math.ceil(s.left / 1000)}s on the clock, scores empty`);
      setScene('Round reset');
      return `round ${s.n} began (${gap} ms after the card), scores empty on both tabs`;
    });
  } finally {
    try { rounds.configure(ROUND_SECONDS); } catch { /* page gone */ }
    try { await bot?.leave(); } catch { /* gone */ }
  }
}
