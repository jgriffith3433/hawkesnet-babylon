// Sound for the demo page, made on the spot with Web Audio: no files to download, nothing generated.
// Footsteps, a chime when someone joins, a soft ambient bed, and a mute button's state that is remembered.
// Browsers only allow sound after the player has done something on the page, so nothing is created or played
// until the first pointer, key or touch; sounds asked for before then are dropped (counted, never queued).
export function createAudio({ storageKey = 'hawkes-net-babylon:muted', target = globalThis } = {}) {
  const store = (() => { try { return target.localStorage ?? null; } catch { return null; } })();
  const stats = { gestureAt: 0, contextAt: 0, steps: 0, chimes: 0, leaves: 0, collects: 0, droppedBeforeGesture: 0, silenced: 0 };
  let muted = false;
  try { muted = store?.getItem(storageKey) === '1'; } catch { /* private mode: not remembered */ }
  let ctx = null, master = null;
  const listeners = new Set();
  const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'];

  const noiseBuffer = (c, seconds, brown) => {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = brown ? (last + 0.02 * w) / 1.02 : w; d[i] = brown ? last * 3.5 : w; }
    return buf;
  };
  const applyMute = () => { if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.04); };

  function startBed() {
    // A soft bed: dark wind that slowly swells, under two quiet detuned fifths.
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuffer(ctx, 6, true); wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.16;
    const swell = ctx.createOscillator(); swell.frequency.value = 0.07;
    const sg = ctx.createGain(); sg.gain.value = 0.07; swell.connect(sg).connect(wg.gain);
    wind.connect(lp).connect(wg).connect(master);
    const pad = ctx.createGain(); pad.gain.value = 0.035; pad.connect(master);
    for (const [hz, detune] of [[110, -4], [164.8, 5], [110, 6]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.detune.value = detune; o.connect(pad); o.start();
    }
    const breath = ctx.createOscillator(); breath.frequency.value = 0.05;
    const bg = ctx.createGain(); bg.gain.value = 0.015; breath.connect(bg).connect(pad.gain);
    wind.start(); swell.start(); breath.start();
  }

  function unlock() {
    if (ctx) return;
    const AC = target.AudioContext || target.webkitAudioContext;
    if (!AC) return;
    stats.gestureAt = stats.gestureAt || performance.now();
    ctx = new AC(); stats.contextAt = performance.now();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    startBed();
    ctx.resume?.().catch(() => {});
  }
  const onGesture = () => {
    stats.gestureAt = stats.gestureAt || performance.now();
    unlock();
    // Only a context that is really running counts as unlocked; keep listening until it is.
    if (ctx?.state === 'running') for (const g of GESTURES) target.removeEventListener(g, onGesture, true);
    else ctx?.resume?.().catch(() => {});
  };
  for (const g of GESTURES) target.addEventListener(g, onGesture, true);

  /** Plays fn(ctx, master) if sound is allowed (after a gesture, not muted); counts what was dropped and why. */
  const play = (counter, fn) => {
    if (!ctx) { stats.droppedBeforeGesture++; return false; }
    stats[counter]++;
    if (muted) { stats.silenced++; return false; }
    fn(ctx, master); return true;
  };
  const tone = (c, out, hz, at, len, vol, type = 'sine') => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.05);
  };

  return {
    stats,
    get muted() { return muted; },
    get unlocked() { return Boolean(ctx); },
    get state() { return ctx?.state ?? 'none'; },
    /** The master level (0 when muted), for checks. */
    get level() { return master ? master.gain.value : null; },
    /** Starts the sound (a gesture handler does this by itself; call it from your own button too). */
    unlock,
    setMuted(m) {
      muted = Boolean(m);
      try { store?.setItem(storageKey, muted ? '1' : '0'); } catch { /* not remembered */ }
      applyMute();
      for (const f of listeners) f(muted);
    },
    toggle() { this.setMuted(!muted); return muted; },
    onMute(f) { listeners.add(f); return () => listeners.delete(f); },
    /** One footstep: a short dull thud with a little grit, a different pitch each time. */
    footstep() {
      return play('steps', (c, out) => {
        const t = c.currentTime, src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.12, false);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 500;
        const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(f).connect(g).connect(out); src.start(t);
        tone(c, out, 70 + Math.random() * 20, t, 0.1, 0.25);
      });
    },
    /** A bright two-note chime going up: someone joined. */
    chime() {
      return play('chimes', (c, out) => {
        const t = c.currentTime;
        tone(c, out, 659.3, t, 0.9, 0.16); tone(c, out, 1318.5, t, 0.5, 0.04);
        tone(c, out, 987.8, t + 0.14, 1.2, 0.16); tone(c, out, 1975.5, t + 0.14, 0.6, 0.04);
      });
    },
    /** A softer, lower two-note fall: someone left. */
    farewell() {
      return play('leaves', (c, out) => {
        const t = c.currentTime;
        tone(c, out, 587.3, t, 0.7, 0.1); tone(c, out, 392, t + 0.16, 1, 0.1);
      });
    },
    /** A bright rising ping: you collected a glowing orb. */
    collect() {
      return play('collects', (c, out) => {
        const t = c.currentTime;
        tone(c, out, 880, t, 0.16, 0.14); tone(c, out, 1320, t + 0.05, 0.22, 0.11);
        tone(c, out, 1760, t + 0.1, 0.35, 0.08);
      });
    },
    /** Stop listening for gestures and close the sound (for tests that make their own). */
    close() { for (const g of GESTURES) target.removeEventListener(g, onGesture, true); try { ctx?.close(); } catch { /* closed */ } },
  };
}
