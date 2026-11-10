// The README stays true: its quickstart parses, its API notes name every export, and the demo links to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as mod from '../hawkes-net-babylon.mjs';

const root = new URL('../', import.meta.url);
const readme = fs.readFileSync(new URL('README.md', root), 'utf8');

test('README quickstart is a complete page whose module script parses', () => {
  const page = readme.match(/```html\n([\s\S]*?)```/)?.[1];
  assert.ok(page, 'an html block');
  assert.match(page, /babylon\.js/);
  assert.match(page, /"@hawkesgen\/net-babylon"/);
  const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  new Function(`return async () => {${script.replace(/^\s*import .*$/m, '')}}`);
});

test('API notes list every export', () => {
  const notes = readme.slice(readme.indexOf('## API notes'));
  assert.ok(notes.length < readme.length, 'an API notes section');
  assert.ok(Object.keys(mod).length >= 6, 'the module exports its names');
  for (const name of Object.keys(mod)) assert.ok(new RegExp('^\\| `' + name + '\\b|`' + name + '`').test(notes) || notes.includes('`' + name + '('), `API notes list ${name}`);
  // The same names are typed in the .d.ts.
  const types = fs.readFileSync(new URL('hawkes-net-babylon.d.ts', root), 'utf8');
  for (const name of Object.keys(mod).filter((n) => n !== 'default')) assert.match(types, new RegExp('export (declare )?(function|const|class|interface|type) ' + name + '\\b|export \\{[^}]*\\b' + name + '\\b'), `types declare ${name}`);
});

test('the demo build makes quickstart.html from the README code, with the playtest contract', async () => {
  const { execFileSync } = await import('node:child_process');
  const page = readme.match(/```html\n([\s\S]*?)```/)[1];
  // The build needs the SDK from node_modules; skip the file check if it isn't installed.
  if (!fs.existsSync(new URL('node_modules/@hawkesgen/net', root))) return;
  execFileSync('node', ['tools/demo.mjs'], { cwd: root.pathname });
  const built = fs.readFileSync(new URL('dist/quickstart.html', root), 'utf8');
  const body = (h) => h.match(/<body>([\s\S]*?)<script type="module">/)[1];
  assert.equal(body(built), body(page), 'same markup as the README');
  for (const line of page.match(/<script type="module">([\s\S]*?)<\/script>/)[1].split('\n').filter((l) => l.trim())) assert.ok(built.includes(line), `README line kept: ${line.trim()}`);
  assert.match(built, /"@hawkesgen\/net-babylon": "\.\/hawkes-net-babylon\.mjs"/);
  assert.match(built, /installNetPlaytest/);
});

test('the demo page links to the README', () => {
  assert.match(fs.readFileSync(new URL('example/index.html', root), 'utf8'), /<a id="readme" href="[^"]*#readme"/);
});

test('the feel scenario measures rule-11 metrics, enforces targets, and marks start/turn/stop clips', () => {
  const html = fs.readFileSync(new URL('example/index.html', root), 'utf8');
  for (const key of ['inputDelayMs', 'timeToFullSpeedMs', 'stopTimeMs', 'cameraLagPeak', 'cameraMaxJump', 'cameraInsideGeometry', 'fovDegrees', 'feel.inputLatencyMs', 'feel.cameraClipSeconds']) {
    assert.ok(html.includes(`'${key}'`), `reports metric ${key}`);
  }
  for (const clip of ['Feel start', 'Feel turn', 'Feel stop']) {
    assert.ok(html.includes(`setScene('${clip}')`), `marks clip scene ${clip}`);
  }
  assert.match(html, /if \(delay >= 100\) throw new Error/);
  assert.match(html, /if \(tFull < 80\) throw new Error/);
  assert.match(html, /if \(tStop < 80\) throw new Error/);
  assert.match(html, /if \(inside\) throw new Error/);
  assert.match(html, /if \(fov < 60 \|\| fov > 75\) throw new Error/);
});

test('dist/ has demo-root.json and both pages define hawkesPlaytest stub before any module import, redirect from /a/b/, and show an error card on load failure', async () => {
  if (!fs.existsSync(new URL('node_modules/@hawkesgen/net', root))) return;
  const { execFileSync } = await import('node:child_process');
  const http = await import('node:http');
  const path = await import('node:path');
  const vm = await import('node:vm');
  execFileSync('node', ['tools/demo.mjs'], { cwd: root.pathname });
  const distDir = path.join(root.pathname, 'dist');
  const marker = JSON.parse(fs.readFileSync(path.join(distDir, 'demo-root.json'), 'utf8'));
  assert.equal(marker.demo, true);
  assert.equal(marker.package, '@hawkesgen/net-babylon');

  for (const file of ['index.html', 'quickstart.html']) {
    const html = fs.readFileSync(path.join(distDir, file), 'utf8');
    const stubIdx = html.indexOf('window.hawkesPlaytest =');
    const modIdx = html.indexOf('<script type="module">');
    assert.ok(stubIdx > 0 && stubIdx < modIdx, `${file} defines window.hawkesPlaytest before <script type="module">`);
    const modCode = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    new Function(`return async () => {${modCode.replace(/^\s*import .*$/gm, '')}}`);
  }

  const hits = [];
  const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    hits.push(p);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(distDir, p);
    if (!f.startsWith(distDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const runBoot = (html, urlStr) => {
      const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
      let replaced = null;
      const els = new Map();
      const mkEl = (tag) => ({
        tagName: tag.toUpperCase(), id: '', textContent: '', style: { cssText: '' }, children: [],
        get firstChild() { return this.children[0] ?? null; },
        setAttribute() {},
        appendChild(c) { this.children.push(c); if (c.id) els.set(c.id, c); return c; },
      });
      const body = mkEl('body');
      const u = new URL(urlStr);
      const win = {
        location: { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash, replace: (to) => { replaced = to; } },
        performance: { now: () => 12 },
        URL, fetch, Object, String, Math, Error,
        addEventListener() {},
        document: {
          body, documentElement: body,
          getElementById: (id) => els.get(id) ?? (body.id === id ? body : null),
          createElement: (t) => mkEl(t),
          addEventListener() {},
        },
      };
      win.window = win;
      vm.runInNewContext(code, win);
      return { win, els, getReplaced: () => replaced };
    };

    // 1. Opening / serves the working demo and defines the stub immediately.
    const rootRes = await fetch(`${base}/?playtest=smoke`);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    const b0 = runBoot(rootHtml, `${base}/?playtest=smoke`);
    assert.equal(b0.win.hawkesPlaytest.state().status, 'loading');
    assert.equal(b0.win.hawkesPlaytest.state().note, 'loading');
    assert.ok(b0.win.hawkesPlaytest.scenarios().some((s) => s.id === 'smoke'));
    assert.equal((await fetch(`${base}/hawkes-net-babylon.mjs`)).status, 200);

    // 2. Opening /a/b/ with ?playtest= probes ./, ../ and ../../demo-root.json once each and location.replace()s to /, keeping the query string.
    const abRes = await fetch(`${base}/a/b/?playtest=smoke&room=r1`);
    assert.equal(abRes.status, 200);
    const abHtml = await abRes.text();
    assert.equal((await fetch(`${base}/a/b/hawkes-net-babylon.mjs`)).status, 404);
    hits.length = 0;
    const b1 = runBoot(abHtml, `${base}/a/b/?playtest=smoke&room=r1`);
    await b1.win.__hawkesDemoBoot.fail(new TypeError('Failed to fetch dynamically imported module'));
    assert.equal(b1.getReplaced(), `${base}/?playtest=smoke&room=r1`);
    assert.deepEqual(hits.filter((h) => h.endsWith('demo-root.json')), ['/a/b/demo-root.json', '/a/demo-root.json', '/demo-root.json']);

    // Quickstart deep path also redirects to /quickstart.html with the same query string.
    const qsHtml = await (await fetch(`${base}/a/b/quickstart.html?playtest=smoke`)).text();
    const bQs = runBoot(qsHtml, `${base}/a/b/quickstart.html?playtest=smoke`);
    await bQs.win.__hawkesDemoBoot.fail(new Error('Failed to load ./hawkes-net-babylon.mjs'));
    assert.equal(bQs.getReplaced(), `${base}/quickstart.html?playtest=smoke`);

    // 3. Opening /a/b/c/ (where ./, ../ and ../../demo-root.json all 404) shows the plain error card and does not repeat URLs.
    hits.length = 0;
    const abcHtml = await (await fetch(`${base}/a/b/c/`)).text();
    const b2 = runBoot(abcHtml, `${base}/a/b/c/`);
    await b2.win.__hawkesDemoBoot.fail(new TypeError('Failed to fetch dynamically imported module: hawkes-net-babylon.mjs'));
    assert.equal(b2.getReplaced(), null);
    assert.deepEqual(hits.filter((h) => h.endsWith('demo-root.json')), ['/a/b/c/demo-root.json', '/a/b/demo-root.json', '/a/demo-root.json']);
    const card = b2.win.document.getElementById('hawkes-demo-error');
    assert.ok(card, 'error card rendered');
    assert.equal(card.firstChild.textContent, 'The demo could not load: Failed to fetch dynamically imported module: hawkes-net-babylon.mjs');
    assert.equal(b2.win.hawkesPlaytest.state().status, 'error');

    // 4. At a shallow path where ../ and ../../ resolve to the same root URL, demo-root.json is never fetched twice.
    hits.length = 0;
    const b3 = runBoot(rootHtml, `${base}/`);
    await b3.win.__hawkesDemoBoot.fail(new Error('broken module at root'));
    assert.equal(b3.getReplaced(), null, 'does not self-redirect at root');
    assert.deepEqual(hits.filter((h) => h.endsWith('demo-root.json')), ['/demo-root.json'], 'no repeated demo-root.json fetches');
    assert.equal(b3.win.document.getElementById('hawkes-demo-error').firstChild.textContent, 'The demo could not load: broken module at root');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});
