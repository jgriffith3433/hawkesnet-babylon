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
  for (const name of Object.keys(mod)) assert.ok(readme.includes('`' + name) , `README names ${name}`);
});

test('the demo page links to the README', () => {
  assert.match(fs.readFileSync(new URL('example/index.html', root), 'utf8'), /<a id="readme" href="[^"]*#readme"/);
});
