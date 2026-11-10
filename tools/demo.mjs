// Builds the demo site into dist/: the example page with this module and the exact @hawkesgen/net it depends on
// (node_modules, from package.json), so the page tests what the package ships. Hawkes Studio publishes dist/ as the
// project's beta site and playtests it there; Studio's beta pages name beta Hawkes Net (window.HAWKES_NET_ENDPOINT),
// so the demo plays on beta Net's free test rooms there.
//   npm ci && node tools/demo.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
const sdk = path.join(root, 'node_modules', '@hawkesgen', 'net');
fs.mkdirSync(out, { recursive: true });
for (const f of ['hawkes-net.mjs', 'hawkes-net-core.mjs']) fs.copyFileSync(path.join(sdk, f), path.join(out, f));
fs.copyFileSync(path.join(root, 'hawkes-net-babylon.mjs'), path.join(out, 'hawkes-net-babylon.mjs'));
// Studio's playtest bot for the page (window.hawkesPlaytest: smoke and two-players).
fs.copyFileSync(path.join(root, 'example', 'net-playtest.mjs'), path.join(out, 'net-playtest.mjs'));
fs.copyFileSync(path.join(root, 'example', 'audio.mjs'), path.join(out, 'audio.mjs'));
let html = fs.readFileSync(path.join(root, 'example', 'index.html'), 'utf8');
const map = /"@hawkesgen\/net": "[^"]+"/;
if (!map.test(html) || !html.includes("import('../hawkes-net-babylon.mjs')")) throw new Error('example/index.html changed: update tools/demo.mjs');
html = html.replace(map, '"@hawkesgen/net": "./hawkes-net.mjs"').replace("import('../hawkes-net-babylon.mjs')", "import('./hawkes-net-babylon.mjs')");
fs.writeFileSync(path.join(out, 'index.html'), html);
// quickstart.html: the README's quickstart block, so it can't drift. Only the import map is pointed at the files beside
// it, and the playtest contract is appended to the same module script (it needs the page's own scene, player and
// multiplayer); the README's own code is not edited. It runs `smoke` itself, and the demo's `quickstart` scenario opens it.
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
let qs = readme.match(/```html\n([\s\S]*?)```/)?.[1];
const imap = /"@hawkesgen\/net": "[^"]+",\s*"@hawkesgen\/net-babylon": "[^"]+"/;
const bcdn = '<script src="https://cdn.babylonjs.com/babylon.js"></script>';
if (!qs || !imap.test(qs) || !qs.includes(bcdn) || !qs.includes('</script>\n</body>')) throw new Error("README quickstart changed: update tools/demo.mjs");
const qsBoot = `<script>
  // Added by tools/demo.mjs: playtest stub at once (loading -> any load error), then demo-root.json recovery or error card.
  (function () {
    var hookAt = performance.now(), err = null, started = '', gone = false, busy = false, tried = Object.create(null);
    var stubScenarios = [
      { id: 'smoke', title: 'Two players in one page meet in a room, move, message and leave', seconds: 45, tags: ['smoke'] },
      { id: 'two-players', title: 'Real browsers on one ?room= find each other, move and message', seconds: 75, tags: ['full', 'multiplayer'] }
    ];
    window.hawkesPlaytest = {
      __stub: true, version: 1, product: 'hawkes-net-babylon quickstart',
      scenarios: function () { return stubScenarios.slice(); },
      start: function (id) { started = String(id || ''); },
      stop: function () {},
      state: function () { return { ready: false, status: err ? 'error' : 'loading', note: err || 'loading' }; },
      report: function () {
        return err ? {
          scenario: started, outcome: 'error', seconds: Math.round((performance.now() - hookAt) / 100) / 10,
          metrics: { hookMs: Math.round(hookAt) },
          events: [{ t: Math.round((performance.now() - hookAt) / 100) / 10, type: 'error', detail: err }],
          problems: [{ severity: 'bug', message: err }], log: ['FAIL ' + err]
        } : null;
      }
    };
    function showCard(reason) {
      err = String(reason || 'module failed to load');
      function paint() {
        var existing = document.getElementById('hawkes-demo-error');
        if (existing) { existing.firstChild.textContent = 'The demo could not load: ' + err; return; }
        var el = document.createElement('div');
        el.id = 'hawkes-demo-error'; el.setAttribute('role', 'alert');
        el.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(14,17,22,.92);color:#e8eaed;font:15px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box';
        var card = document.createElement('div');
        card.style.cssText = 'max-width:30rem;padding:18px 20px;border-radius:10px;background:#151a22;border:1px solid rgba(255,123,114,.55);box-shadow:0 8px 28px rgba(0,0,0,.45);overflow-wrap:anywhere';
        card.textContent = 'The demo could not load: ' + err;
        el.appendChild(card);
        (document.body || document.documentElement).appendChild(el);
      }
      if (document.body) paint(); else document.addEventListener('DOMContentLoaded', paint);
    }
    window.__hawkesDemoBoot = {
      hookAt: hookAt, tried: tried,
      fail: async function (e) {
        if (gone || busy || err) return;
        busy = true;
        var reason = (e && (e.message || String(e))) || 'module failed to load';
        var here = new URL('.', location.href).href;
        var bases = ['./', '../', '../../'];
        for (var i = 0; i < bases.length; i++) {
          var u = new URL(bases[i] + 'demo-root.json', location.href);
          if (tried[u.href]) continue;
          tried[u.href] = 1;
          try {
            var r = await fetch(u.href, { headers: { Accept: 'application/json' } });
            if (!r.ok) continue;
            var j = await r.json().catch(function () { return null; });
            if (!j || j.demo !== true) continue;
            var dest = new URL('.', u);
            if (dest.href === here) break;
            var go = new URL('./quickstart.html', dest);
            go.search = location.search; go.hash = location.hash;
            gone = true; location.replace(go.href); return;
          } catch (x) { /* try the next */ }
        }
        showCard(reason);
      }
    };
    addEventListener('error', function (e) {
      if (!window.hawkesPlaytest || !window.hawkesPlaytest.__stub) return;
      var t = e && e.target;
      if (t && t.tagName === 'SCRIPT') window.__hawkesDemoBoot.fail(new Error('Failed to load ' + (t.src || './hawkes-net-babylon.mjs')));
      else if ((!t || t === window) && e && (e.error || e.message)) window.__hawkesDemoBoot.fail(e.error || e.message);
    }, true);
    addEventListener('unhandledrejection', function (e) {
      if (window.hawkesPlaytest && window.hawkesPlaytest.__stub) window.__hawkesDemoBoot.fail(e && e.reason);
    });
  })();
</script>\n`;
qs = qs.replace(bcdn, qsBoot + bcdn).replace(imap, '"@hawkesgen/net": "./hawkes-net.mjs",\n  "@hawkesgen/net-babylon": "./hawkes-net-babylon.mjs"');
const glue = `
  // ---- appended by tools/demo.mjs (not in the README): Studio's playtest contract for this page
  const { installNetPlaytest } = await import('./net-playtest.mjs');
  const { lobby } = await import('@hawkesgen/net');
  const q = new URLSearchParams(location.search);
  const endpoint = q.get('net') || undefined;
  const key = (k, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true }));
  installNetPlaytest({
    product: 'hawkes-net-babylon quickstart',
    where: (endpoint || globalThis.HAWKES_NET_ENDPOINT || 'https://net.hawkesgen.ai').replace(/^https?:\\/\\//, ''),
    main: () => mp.lobby,
    openBot: async () => {
      const b = lobby({ project: 'netdemo', transport: 'relay', ...(endpoint ? { endpoint } : {}), name: 'Playtest bot', log: false });
      b.join('quickstart');
      return b;
    },
    drive: async (step) => { key('d', true); await step(1000); key('d', false); key('w', true); await step(800); key('w', false); await step(100); },
    myPos: () => { const p = me.getAbsolutePosition(); return [p.x, p.y, p.z]; },
    shownPos: (id) => { const n = mp.peers.get(id)?.node; return n ? [n.position.x, n.position.y, n.position.z] : null; },
    botPose: (u) => [-4 + 8 * u, 0, -4],
    tolerance: 0.3,
    ready: () => scene.isReady() && mp.lobby,
  });
  if (window.__hawkesDemoBoot) window.__hawkesDemoBoot.upgradedAt = performance.now();
`;
qs = qs.replace('</script>\n</body>', glue + '</script>\n</body>');
fs.writeFileSync(path.join(out, 'quickstart.html'), qs);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const net = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify({ package: '@hawkesgen/net-babylon', version, net }, null, 2) + '\n');
// Marker at the site root so a page opened too deep can find the real demo and location.replace() there.
fs.writeFileSync(path.join(out, 'demo-root.json'), JSON.stringify({ demo: true, package: '@hawkesgen/net-babylon', version, net }, null, 2) + '\n');
// Deep-path fixtures for the demo-boot playtest and local checks (/a/b/ redirects via ../../demo-root.json; /a/b/c/ shows the error card).
for (const rel of ['a/b', 'a/b/c']) {
  const dir = path.join(out, ...rel.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'quickstart.html'), qs);
}
console.log(`dist/: demo of @hawkesgen/net-babylon ${version} on @hawkesgen/net ${net}`);
