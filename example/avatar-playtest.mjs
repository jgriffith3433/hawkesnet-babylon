// Avatar checks for the demo (the `avatars` scenario): planted-foot speed of a walking remote player, a wave seen on both tabs
// and blended back, a 360-degree camera orbit that must never show a mirrored nameplate, and the phone's wave button and
// nameplate size. Everything is read from the page's real scene through probe.avatar (index.html); the second player moves by
// a real pose stream, this page's player waves by a real E key press.

const FOOT_CM_S_MAX = 5;      // a planted foot may move at most this fast over the ground, cm/s
const PLANTED_BAND_M = 0.03;  // a foot is planted while it is within this height of its own lowest point
const LAG_MS = 100;           // foot speed is measured over about this long, so one frame's jitter does not count
const MIN_TEXT_PX = 12;
const MIN_TAP_PX = 44;

export async function avatarChecks(c) {
  const { check, event, until, wait, metric, scene: setScene, probe, B, cam, bot, node, me, key, onFrame, heard } = c;
  const av = probe.avatar;
  const at = [0, 0, -6], R = 6;   // the walker's circle round (0, 0), radius R
  let ang = 0, last = performance.now(), speed = 0, walking = false, stopWalker = false;
  // The walker: a real pose stream at 20 Hz along a circle at `speed` m/s.
  const walker = (async () => {
    while (!stopWalker) {
      const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
      if (walking) ang += (speed / R) * dt;
      at[0] = Math.cos(ang) * R; at[2] = Math.sin(ang) * R;
      const yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));   // heading along the circle (increasing ang)
      bot.pose(at, yaw, { h: 200 });
      await wait(50);
    }
  })();
  const walkAt = async (v, settleMs = 1500) => { speed = v; walking = v > 0; await wait(settleMs); };

  // Planted-foot speed in the world, per foot: frames in which the foot is down, speed over a ~100 ms window.
  const measure = async (ms) => {
    const rec = [[], []];
    const off = onFrame(() => {
      const n = node(); if (!n) return;
      const t = performance.now();
      av.feet(n).forEach((p, i) => rec[i]?.push([t, p[0], p[1], p[2]]));
    });
    await wait(ms); off();
    let sum = 0, cnt = 0, worst = 0;
    for (const f of rec) {
      if (f.length < 20) continue;
      const ys = f.map((s) => s[2]).sort((a, b) => a - b), floor = ys[Math.floor(ys.length * 0.03)];
      const down = (s) => s[2] <= floor + PLANTED_BAND_M;
      for (let i = 0, j = 0; i < f.length; i++) {
        while (j < i && f[i][0] - f[j + 1][0] >= LAG_MS) j++;
        if (f[i][0] - f[j][0] < LAG_MS || !down(f[i]) || !down(f[j])) continue;
        const v = Math.hypot(f[i][1] - f[j][1], f[i][3] - f[j][3]) / ((f[i][0] - f[j][0]) / 1000);
        sum += v; cnt++; worst = Math.max(worst, v);
      }
    }
    return { cmS: cnt ? (sum / cnt) * 100 : NaN, worstCmS: worst * 100, samples: cnt };
  };

  setScene?.('Walking remote player');
  const ref = av.refSpeeds();
  event('clip-speeds', `walk clip covers ${ref.walk.toFixed(2)} m/s, run clip ${ref.run.toFixed(2)} m/s at rate 1 (${ref.calibrated ? 'measured from the foot bones' : 'defaults'})`);
  const slow = Math.max(0.6, ref.walk * 0.7), walk = ref.walk * 1.05;
  for (const [label, v] of [['slow walk', slow], ['walk', walk]]) {
    await check(`A remote player's planted foot moves under ${FOOT_CM_S_MAX} cm/s while it ${label}s (${v.toFixed(1)} m/s)`, async () => {
      await walkAt(v, 1800);
      const sh0 = node().position.clone();
      const m = await measure(4000);
      const sh1 = node().position;
      const ground = Math.hypot(sh1.x - sh0.x, sh1.z - sh0.z) / 4;
      metric?.(label === 'walk' ? 'plantedFootCmS' : 'plantedFootSlowCmS', Math.round(m.cmS * 10) / 10);
      event('foot-speed', `${label}: planted foot ${m.cmS.toFixed(1)} cm/s (worst frame window ${m.worstCmS.toFixed(0)}), avatar moved ${ground.toFixed(2)} m/s, ${m.samples} planted samples`);
      if (!(m.samples >= 20)) throw new Error(`only ${m.samples} planted-foot samples: the feet were never down (or never moved)`);
      if (ground < v * 0.6) throw new Error(`the remote avatar moved at ${ground.toFixed(2)} m/s, not the ${v.toFixed(1)} m/s that was sent`);
      if (!(m.cmS < FOOT_CM_S_MAX)) throw new Error(`planted foot moves ${m.cmS.toFixed(1)} cm/s over the ground (limit ${FOOT_CM_S_MAX}): foot sliding`);
      return `${m.cmS.toFixed(1)} cm/s planted-foot speed at ${ground.toFixed(2)} m/s ground speed`;
    });
  }
  await check('The walk, run and idle clips are blended by speed (a run is not a fast walk)', async () => {
    await walkAt(walk, 1200);
    const wWalk = av.weights(node());
    await walkAt(Math.min(ref.run * 1.1, 5), 1800);
    const wRun = av.weights(node());
    const m = await measure(3000);
    event('foot-speed', `run: planted foot ${m.cmS.toFixed(1)} cm/s over ${m.samples} samples (not gated)`);
    metric?.('plantedFootRunCmS', Math.round(m.cmS * 10) / 10);
    await walkAt(0, 2500);
    const wIdle = av.weights(node());
    event('blend', `walking ${JSON.stringify(round(wWalk))} · running ${JSON.stringify(round(wRun))} · standing ${JSON.stringify(round(wIdle))}`);
    if (!(wWalk.Walking > 0.6)) throw new Error(`walking: Walking weight is only ${wWalk.Walking.toFixed(2)}`);
    if (!(wRun.Running > 0.6)) throw new Error(`running: Running weight is only ${wRun.Running.toFixed(2)}`);
    if (!(wIdle.Idle > 0.9)) throw new Error(`standing: Idle weight is only ${wIdle.Idle.toFixed(2)}`);
    return 'idle → walk → run → idle by the synced speed';
  });

  // The wave, both ways. E on this tab (real key) reaches the other tab; the other tab's wave plays here as a layer that blends back.
  setScene?.('Wave');
  await check('E on this tab waves on the other tab, and blends back to the base pose', async () => {
    await walkAt(0, 500);
    const got = heard('hn-emote');
    key('e', true); key('e', false);
    const d = await Promise.race([got, wait(5000).then(() => null)]);
    if (d?.e !== 'wave') throw new Error('the other tab never received the wave');
    await until(() => av.waveAmt(me) > 0.6, 2000, 'this avatar to play its wave');
    await until(() => av.waveAmt(me) === 0 && av.weights(me).Idle > 0.9, 4000, 'the wave to blend back to Idle');
    return 'wave sent to the other tab, played, blended back to Idle';
  });
  await check('A wave from the other tab plays here over the walk, and the legs keep walking', async () => {
    await walkAt(walk, 1500);
    bot.send('hn-emote', { e: 'wave' });
    await until(() => av.waveAmt(node()) > 0.6, 3000, "the other player's wave clip");
    const w = av.weights(node());
    event('wave', `wave ${w.Wave.toFixed(2)} over Walking ${w.Walking.toFixed(2)}`);
    if (!(w.Walking > 0.5)) throw new Error(`the walk stopped under the wave (Walking weight ${w.Walking.toFixed(2)})`);
    const m = await measure(1000);
    await until(() => av.waveAmt(node()) === 0, 3000, 'the wave to blend back');
    return `waved while walking (planted foot ${m.cmS.toFixed(1)} cm/s), then back to the base pose`;
  });

  // 360 degrees round the remote player: the camera follows it and goes all the way round; every frame its plate (and ours) is checked.
  setScene?.('Nameplate orbit');
  await check('A 360-degree camera orbit round a remote player shows no mirrored nameplate', async () => {
    await walkAt(walk * 0.7, 800);
    const saved = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, t: cam.target.clone() };
    av.orbit(true);
    const ORBIT_MS = 12000, a0 = cam.alpha;
    let frames = 0, mirrored = 0, upside = 0, seen = 0, minPx = 1e9, worst = null;
    const t0 = performance.now();
    const off = onFrame(() => {
      frames++;
      const u = Math.min(1, (performance.now() - t0) / ORBIT_MS);
      const n = node(); if (n) cam.target.set(n.position.x, 1.2, n.position.z);
      cam.alpha = a0 + u * Math.PI * 2; cam.beta = 1.1; cam.radius = 9;
      for (const t of av.tags()) {
        if (!t.onScreen) continue;   // every plate in view: the remote player's and ours
        seen++; minPx = Math.min(minPx, t.textPx);
        if (t.mirrored) { mirrored++; worst = t.name; }
        if (t.upsideDown) upside++;
      }
    });
    try {
      while (performance.now() - t0 < ORBIT_MS) { await wait(500); event('orbit', `${Math.round(((performance.now() - t0) / ORBIT_MS) * 100)}% · plates seen ${seen} · mirrored ${mirrored}`); }
    } finally {
      off(); av.orbit(false);
      cam.alpha = saved.alpha; cam.beta = saved.beta; cam.radius = saved.radius; cam.target.copyFrom(saved.t);
    }
    metric?.('mirroredNameplateFrames', mirrored + upside);
    metric?.('nameplateOrbitFrames', frames);
    metric?.('nameplateMinTextPx', Math.round(minPx * 10) / 10);
    event('orbit-done', `${frames} frames, plates seen ${seen}, mirrored ${mirrored}, upside down ${upside}, smallest text ${minPx.toFixed(1)} px`);
    if (seen < frames * 0.8) throw new Error(`the nameplate was on screen in only ${seen} of ${frames} frames`);
    if (mirrored || upside) throw new Error(`${mirrored} mirrored and ${upside} upside-down nameplate frames${worst ? ` (${worst})` : ''}`);
    return `${frames} frames all the way round, 0 mirrored; smallest text ${minPx.toFixed(1)} px`;
  });
  stopWalker = true; await walker;
}

const round = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * 100) / 100]));

// On a real 390x844 touch frame (player B, ?as=B&touch=1): the Wave button, and the nameplates of the players it sees.
export async function phoneAvatarChecks({ check, event, until, metric, scene: setScene, win, presence, atPhoneSize }) {
  const probe = win.__hawkesDemoProbe, doc = win.document;
  setScene?.('Phone wave button');
  const R = (el) => probe.rect(el);
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  await check('Phone: the Wave button is at least 44 px, on screen and clear of the other controls', async () => {
    if (!atPhoneSize(win)) throw new Error(`the frame is ${win.innerWidth}x${win.innerHeight}, not 390x844`);
    const b = R(probe.wave), vw = win.innerWidth, vh = win.innerHeight;
    if (probe.style(probe.wave).display === 'none') throw new Error('the Wave button is not shown on a touch screen');
    if (b.width < MIN_TAP_PX || b.height < MIN_TAP_PX) throw new Error(`the Wave button is ${Math.round(b.width)}x${Math.round(b.height)} px (want at least ${MIN_TAP_PX})`);
    if (b.left < 0 || b.top < 0 || b.right > vw || b.bottom > vh) throw new Error('the Wave button is not fully on screen');
    for (const [n, el] of [['joystick', probe.stick], ['sound button', probe.mute], ['info panel', probe.hud], ['scoreboard', probe.scores]]) if (hits(b, R(el))) throw new Error(`the Wave button overlaps the ${n}`);
    metric?.('waveButtonPx', Math.round(Math.min(b.width, b.height)));
    event('wave-button', `${Math.round(b.width)}x${Math.round(b.height)} px at ${Math.round(b.left)},${Math.round(b.top)}`);
    return `${Math.round(b.width)}x${Math.round(b.height)} px, inside the screen, no overlap`;
  });
  await check('Phone: tapping the Wave button makes the other tab see a wave', async () => {
    const bId = probe.lobby().id;
    const before = presence().filter((e) => e.type === 'emote' && e.id === bId).length;
    const el = probe.wave, r = R(el), at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true };
    el.dispatchEvent(new win.PointerEvent('pointerdown', at)); el.dispatchEvent(new win.PointerEvent('pointerup', at)); el.click();
    await until(() => presence().filter((e) => e.type === 'emote' && e.id === bId).length > before, 5000, 'this tab to see the phone player wave');
    return 'the tap reached the other tab';
  });
  await check(`Phone: nameplate text is at least ${MIN_TEXT_PX} px tall at 390x844`, async () => {
    setScene?.('Phone nameplates');
    await until(() => probe.avatar.tags().some((t) => t.name.startsWith('hn-tag-')), 8000, 'a remote nameplate on the phone');
    const tags = probe.avatar.tags();
    const px = Math.min(...tags.map((t) => t.textPx));
    metric?.('phoneNameplateTextPx', Math.round(px * 10) / 10);
    event('nameplate', tags.map((t) => `${t.name} ${t.textPx.toFixed(1)} px${t.mirrored ? ' MIRRORED' : ''}`).join(' · '));
    if (px < MIN_TEXT_PX) throw new Error(`nameplate text is ${px.toFixed(1)} px tall (want at least ${MIN_TEXT_PX})`);
    if (tags.some((t) => t.mirrored)) throw new Error('a nameplate is mirrored on the phone');
    return `${tags.length} nameplates, smallest ${px.toFixed(1)} px`;
  });
}
