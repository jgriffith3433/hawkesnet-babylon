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
let html = fs.readFileSync(path.join(root, 'example', 'index.html'), 'utf8');
const map = /"@hawkesgen\/net": "[^"]+"/;
if (!map.test(html) || !html.includes("import('../hawkes-net-babylon.mjs')")) throw new Error('example/index.html changed: update tools/demo.mjs');
html = html.replace(map, '"@hawkesgen/net": "./hawkes-net.mjs"').replace("import('../hawkes-net-babylon.mjs')", "import('./hawkes-net-babylon.mjs')");
fs.writeFileSync(path.join(out, 'index.html'), html);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const net = JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify({ package: '@hawkesgen/net-babylon', version, net }, null, 2) + '\n');
console.log(`dist/: demo of @hawkesgen/net-babylon ${version} on @hawkesgen/net ${net}`);
