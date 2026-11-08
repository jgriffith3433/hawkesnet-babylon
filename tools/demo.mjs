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
if (!qs || !imap.test(qs) || !qs.includes('</script>\n</body>')) throw new Error("README quickstart changed: update tools/demo.mjs");
qs = qs.replace(imap, '"@hawkesgen/net": "./hawkes-net.mjs",\n  "@hawkesgen/net-babylon": "./hawkes-net-babylon.mjs"');
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
`;
qs = qs.replace('</script>\n</body>', glue + '</script>\n</body>');
fs.writeFileSync(path.join(out, 'quickstart.html'), qs);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const net = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify({ package: '@hawkesgen/net-babylon', version, net }, null, 2) + '\n');
console.log(`dist/: demo of @hawkesgen/net-babylon ${version} on @hawkesgen/net ${net}`);
