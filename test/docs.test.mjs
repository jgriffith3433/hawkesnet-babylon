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
