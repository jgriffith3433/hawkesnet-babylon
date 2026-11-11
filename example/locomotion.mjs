// Locomotion for a rigged character: Idle, Walking and Running are blended by the avatar's speed, and each clip's playback
// rate is set every frame so its planted foot travels backward at exactly the ground speed (rate = speed / the clip's own
// planted-foot speed at that moment of the stride, a table measured from the foot bones by calibrate()). The Wave clip is an upper-body layer eased in and out on top.
//
//   const loco = createLocomotion(BABYLON);
//   char = { holder, g: { Idle, Walking, Running, Wave }, w: { Idle: 1, Walking: 0, Running: 0 }, wave: 0, waveFrom, waveUntil, feet: loco.footsOf(holder) }
//   loco.calibrate(char, k)               once per model (k: the holder's scale), before the first locomote
//   loco.locomote(char, speed, dt, now)   every frame

export function createLocomotion(B) {
  const REF = { done: false, Walking: 1.6, Running: 4.2, table: {} };   // m/s of ground one clip cycle covers at rate 1 (replaced by the measure)
  const footsOf = (holder) => holder.getChildTransformNodes(false).filter((n) => n.getClassName() === 'TransformNode' && /Foot\.[LR]$/.test(n.name) && n.getChildren().some((ch) => /_end$/.test(ch.name)));
  const fresh = (n) => { const chain = []; for (let p = n; p; p = p.parent) chain.unshift(p); for (const p of chain) p.computeWorldMatrix(true); return n.getAbsolutePosition(); };
  // Measure each clip: sample the foot bones through one loop. At every step the foot that is down (the lower one) travels
  // backward at some speed (m/s, at rate 1): the clip's ground speed *at that moment*. A walk cycle is not even (the foot
  // eases into and out of the ground), so the table is by phase, and locomote() sets the rate from it every frame.
  const calibrate = (c, k) => {
    REF.done = true;
    try {
      if (!c.feet.length) return;
      c.holder.computeWorldMatrix(true);
      const inv = B.Matrix.Invert(c.holder.getWorldMatrix());
      for (const name of ['Walking', 'Running']) {
        const g = c.g[name]; if (!g || !g.targetedAnimations.length) continue;
        const fps = g.targetedAnimations[0].animation.framePerSecond || 60, N = 96, from = g.from, to = g.to;
        g.start(false, 1, from, to); g.pause();
        const lanes = c.feet.map(() => []);
        for (let i = 0; i <= N; i++) {
          g.goToFrame(from + (to - from) * i / N);
          c.feet.forEach((f, j) => { const p = B.Vector3.TransformCoordinates(fresh(f), inv); lanes[j].push([p.x * k, p.y * k, p.z * k]); });
        }
        g.stop();
        const dt = (to - from) / N / fps;
        const floor = lanes.map((ln) => Math.min(...ln.map((p) => p[1])));
        const v = [];
        for (let i = 0; i < N; i++) {
          let best = null;   // the foot that is down: nearest its own lowest point
          lanes.forEach((ln, j) => { const y = (ln[i][1] + ln[i + 1][1]) / 2 - floor[j]; if (!best || y < best.y) best = { y, back: -(ln[i + 1][2] - ln[i][2]) / dt }; });   // the model faces +z
          v.push(best.y <= 0.04 ? Math.max(0, best.back) : NaN);   // NaN: both feet in the air (a run's flight)
        }
        const down = v.filter(Number.isFinite), plain = down.reduce((a, b) => a + b, 0) / Math.max(1, down.length);
        const filled = v.map((x) => (Number.isFinite(x) ? x : plain));
        const sm = filled.map((_, i) => (filled[(i + N - 1) % N] + 2 * filled[i] + filled[(i + 1) % N]) / 4);   // the loop wraps
        const mean = plain;
        if (mean > 0.3) { REF[name] = mean; REF.table[name] = { from, to, N, v: sm, floor: mean * 0.35 }; }
      }
    } catch (e) { console.warn('locomotion calibration skipped', e); }
  };
  // The playback rate that keeps the planted foot still on the ground at this moment of the clip.
  const rateFor = (g, name, sp) => {
    const t = REF.table[name], mean = REF[name];
    const an = g.animatables?.[0] ?? g._animatables?.[0];
    if (!t || !an || !Number.isFinite(an.masterFrame)) return Math.min(2.2, Math.max(0.3, sp / mean));
    const u = ((an.masterFrame - t.from) / (t.to - t.from)) % 1, i = Math.min(t.N - 1, Math.max(0, Math.floor((u < 0 ? u + 1 : u) * t.N)));
    return Math.min(3.5, Math.max(0.25, sp / Math.max(t.floor, t.v[i])));
  };
  const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const setClip = (g, w, rate) => {
    if (!g) return;
    if (w < 0.01) { if (g.isPlaying) g.stop(); return; }
    if (!g.isPlaying) g.start(true, rate);
    g.speedRatio = rate; g.setWeightForAllAnimatables(w);
  };
  const locomote = (c, sp, dt, now) => {
    const vw = REF.Walking, vr = REF.Running;
    const go = smooth01((sp - 0.15) / 0.5);                         // 0 standing .. 1 walking (a short blend out of Idle)
    const mid = (vw + vr) / 2, run = smooth01((sp - (mid - 0.3 * (vr - vw))) / (0.6 * (vr - vw)));
    const want = { Idle: 1 - go, Walking: go * (1 - run), Running: go * run };
    const f = 1 - Math.exp(-dt * 12);
    for (const n of ['Idle', 'Walking', 'Running']) c.w[n] += (want[n] - c.w[n]) * f;
    setClip(c.g.Idle, c.w.Idle, 1);
    if (c.g.Walking) setClip(c.g.Walking, c.w.Walking, rateFor(c.g.Walking, 'Walking', sp));
    if (c.g.Running) setClip(c.g.Running, c.w.Running, rateFor(c.g.Running, 'Running', sp));
    // The wave: eased in over 0.15 s and out over 0.3 s, as a layer over whatever the legs are doing.
    const amt = now < c.waveUntil ? Math.min(1, (now - c.waveFrom) / 150, (c.waveUntil - now) / 300) : 0;
    c.wave = amt;
    const a = Math.min(0.97, smooth01(amt));
    if (a > 0.003 && c.g.Wave) { if (!c.g.Wave.isPlaying) c.g.Wave.start(true, 1); c.g.Wave.setWeightForAllAnimatables(a / (1 - a)); }   // base weights sum to 1, so a/(1-a) is a share of a
    else if (c.g.Wave?.isPlaying) c.g.Wave.stop();
  };
  // The wave as an upper-body layer: only the arms, shoulders, neck and head are kept, so the legs keep walking under it.
  const layerWave = (wave) => {
    if (!wave) return;
    const keep = /-(Shoulder|UpperArm|Arm|LowerArm|Palm|Middle|Thumb|Index|Ring|Neck|Head)(?![A-Za-z_])/;
    for (const t of [...wave.targetedAnimations]) if (!keep.test(String(t.target?.name))) wave.removeTargetedAnimation(t.animation);
  };
  return { REF, footsOf, fresh, calibrate, locomote, layerWave };
}
