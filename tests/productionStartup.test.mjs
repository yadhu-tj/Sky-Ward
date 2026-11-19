import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('audio mode changes and automatic startup do not create audio before a gesture', () => {
  const exports = {};
  let contexts = 0;
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/backgroundMusic.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, navigator: { userActivation: { hasBeenActive: false } }, window: { AudioContext: class { constructor() { contexts++; } } } });
  exports.backgroundMusic.setMode('MENU');
  exports.backgroundMusic.setMode('PAUSED');
  exports.backgroundMusic.start();
  assert.equal(contexts, 0);
  assert.equal(exports.backgroundMusic.getMode(), 'PAUSED');
});

test('runtime scripts keep their sibling WebAssembly filenames intact in production', {
  skip: !existsSync(new URL('../dist/mediapipe/hands-0.4.1675469240/', import.meta.url)),
}, () => {
  const root = new URL('../dist/mediapipe/hands-0.4.1675469240/', import.meta.url);
  for (const variant of ['simd_wasm', 'wasm']) {
    const script = readFileSync(new URL(`hands_solution_${variant}_bin.js`, root), 'utf8');
    const wasm = script.match(/wasmBinaryFile="([^"]+\.wasm)"/)[1];
    assert.ok(existsSync(new URL(wasm, root)));
    const bytes = readFileSync(new URL(wasm, root));
    assert.equal(bytes.subarray(0, 4).toString('hex'), '0061736d');
  }
});
