import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/hooks/useMediaPipeHands.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function mountTracker(lightweight = true, getUserMedia) {
  const effects = [], states = [], models = [];
  const react = {
    useState(initial) { const index = states.length; states.push(initial); return [initial, (next) => { states[index] = next; }]; },
    useRef(value) { return { current: value }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); },
  };
  class Hands {
    constructor(options) { this.options = options; models.push(this); }
    setOptions(options) { this.config = options; }
    onResults(callback) { this.results = callback; }
    initialize() { return new Promise((resolve) => { this.finishInitialize = resolve; }); }
    async close() { this.closed = true; }
  }
  const exports = {};
  runInNewContext(source, { exports, console,
    navigator: { mediaDevices: getUserMedia ? { getUserMedia } : undefined },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    require: (name) => name === 'react' ? react : name === '@mediapipe/hands' ? { Hands } : name === './handAssets' ? { handAssetUrl: (file) => `/assets/${file}` } : require(name),
  });
  const api = exports.useMediaPipeHands(undefined, lightweight);
  return { api, states, models, run: () => effects.map((fn) => fn()).filter(Boolean) };
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('StrictMode discarded mount never constructs a WASM runtime', async () => {
  const tracker = mountTracker();
  tracker.run().forEach((cleanup) => cleanup());
  const cleanups = tracker.run();
  await tick();
  assert.equal(tracker.models.length, 1);
  const model = tracker.models[0];
  assert.equal(model.config.modelComplexity, 0);
  assert.equal(tracker.states[2], false);
  model.finishInitialize();
  await tick();
  assert.equal(tracker.states[2], false);
  model.results({ multiHandLandmarks: [] });
  assert.equal(tracker.states[2], true);
  cleanups.forEach((cleanup) => cleanup());
  await tick();
  assert.equal(model.closed, true);
});

test('unmount waits for WASM initialization before closing', async () => {
  const tracker = mountTracker(false);
  const cleanups = tracker.run();
  await tick();
  const model = tracker.models[0];
  assert.equal(model.config.modelComplexity, 1);
  cleanups.forEach((cleanup) => cleanup());
  assert.equal(model.closed, undefined);
  model.finishInitialize();
  await tick();
  assert.equal(model.closed, true);
  model.results({ multiHandLandmarks: [] });
  assert.equal(tracker.states[2], false);
});

function cameraStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}

test('simultaneous camera starts share one permission request and one stream', async () => {
  let finish, calls = 0;
  const tracker = mountTracker(true, () => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const cleanup = tracker.run();
  const first = tracker.api.startCamera();
  const second = tracker.api.startCamera();
  assert.equal(first, second);
  assert.equal(calls, 1);
  const { stream } = cameraStream();
  finish(stream);
  assert.equal(await first, true);
  cleanup.forEach((fn) => fn());
  tracker.models[0]?.finishInitialize();
  await tick();
});

test('stopping during a pending permission request closes the late stream', async () => {
  let finish;
  const tracker = mountTracker(true, () => new Promise((resolve) => { finish = resolve; }));
  const cleanup = tracker.run();
  const pending = tracker.api.startCamera();
  tracker.api.stopCamera();
  const { stream, track } = cameraStream();
  finish(stream);
  assert.equal(await pending, false);
  assert.equal(track.stopped, true);
  assert.equal(tracker.states[3], false);
  cleanup.forEach((fn) => fn());
  tracker.models[0]?.finishInitialize();
  await tick();
});

test('insecure or unsupported contexts get a useful camera error', async () => {
  const tracker = mountTracker();
  tracker.run();
  assert.equal(await tracker.api.startCamera(), false);
  assert.match(tracker.states[4], /HTTPS or localhost/);
  tracker.models[0]?.finishInitialize();
});
