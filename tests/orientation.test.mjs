import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTypeScript(path, replacements = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports,
    require: (name) => replacements[name] ?? require(name),
    window: replacements.window,
  });
  return exports;
}
const orientation = loadTypeScript('../src/input/orientation.ts');
const motionReadiness = loadTypeScript('../src/input/motionReadiness.ts');

// Exercise the actual sensor hook with deterministic React lifecycle and browser events.
function mountOrientation({ angle = 270, permission } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const listeners = new Map();
  const window = {
    innerWidth: 844, innerHeight: 390,
    screen: { orientation: { angle } },
    DeviceOrientationEvent: permission ? { requestPermission: permission } : {},
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: initial });
    },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const prev = slots[index];
      if (!prev || deps.some((dep, i) => dep !== prev.deps[i])) {
        effects.push(() => {
          prev?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const { useDeviceOrientation } = loadTypeScript('../src/hooks/useDeviceOrientation.ts', {
    react, window, '../input/orientation': orientation, '../input/motionReadiness': motionReadiness,
  });
  const render = () => {
    cursor = 0;
    effects = [];
    const result = useDeviceOrientation();
    effects.forEach((effect) => effect());
    return result;
  };
  render();
  render();
  return {
    render, window,
    reading(beta, gamma = 0) { listeners.get('deviceorientation')?.({ beta, gamma }); },
    get listening() { return listeners.has('deviceorientation'); },
  };
}

test('first sensor reading establishes neutral instead of snapping to a tilt', () => {
  const sensor = mountOrientation();
  sensor.reading(30);
  assert.equal(sensor.render().tiltAngleRad, 0);
});

test('reverse landscape recalibration stays level at the same physical angle', () => {
  const sensor = mountOrientation();
  sensor.reading(10);
  sensor.reading(30);
  assert.ok(sensor.render().tiltAngleRad < 0);
  sensor.render().calibrateNeutral();
  sensor.reading(30);
  assert.equal(sensor.render().tiltAngleRad, 0);
});

test('rotating from landscape to portrait resets the sensor axis baseline', () => {
  const sensor = mountOrientation({ angle: 90 });
  sensor.reading(10);
  sensor.window.innerWidth = 390;
  sensor.window.innerHeight = 844;
  sensor.window.screen.orientation.angle = 0;
  sensor.reading(35, 25);
  assert.equal(sensor.render().tiltAngleRad, 0);
  sensor.reading(35, 35);
  assert.ok(sensor.render().tiltAngleRad > 0);
});

test('denied iOS motion permission leaves sensor listener disabled', async () => {
  const sensor = mountOrientation({ permission: async () => 'denied' });
  assert.equal(await sensor.render().requestPermission(), false);
  assert.equal(sensor.listening, false);
  assert.equal(sensor.render().isPermissionGranted, false);
});

test('permission granted before first reading calibrates on that first reading', async () => {
  const sensor = mountOrientation({ permission: async () => 'granted' });
  assert.equal(await sensor.render().requestPermission(), true);
  sensor.render();
  sensor.reading(42);
  assert.equal(sensor.render().tiltAngleRad, 0);
});

test('motion reading must include a finite value on the active screen axis', () => {
  assert.equal(motionReadiness.hasMotionReading({ beta: null, gamma: 10 }, true), false);
  assert.equal(motionReadiness.hasMotionReading({ beta: 10, gamma: null }, false), false);
  assert.equal(motionReadiness.hasMotionReading({ beta: NaN, gamma: 10 }, true), false);
  assert.equal(motionReadiness.hasMotionReading({ beta: 10, gamma: 0 }, true), true);
});

function fakeMotionTarget() {
  let onReading;
  let expire;
  const target = {
    innerWidth: 390, innerHeight: 844,
    setTimeout(callback) { expire = callback; return 1; },
    clearTimeout() { expire = null; },
    addEventListener(name, callback) { onReading = callback; },
    removeEventListener() { onReading = null; },
  };
  return { target, read: (event) => onReading?.(event), timeout: () => expire?.(), listening: () => !!onReading };
}

test('sensor timeout returns false and removes its listener', async () => {
  const sensor = fakeMotionTarget();
  const ready = motionReadiness.waitForMotionReading(sensor.target);
  sensor.timeout();
  assert.equal(await ready, false);
  assert.equal(sensor.listening(), false);
});

test('null readings do not pass sensor readiness; real readings clean up the listener', async () => {
  const sensor = fakeMotionTarget();
  const ready = motionReadiness.waitForMotionReading(sensor.target);
  sensor.read({ beta: null, gamma: null });
  assert.equal(sensor.listening(), true);
  sensor.read({ beta: 0, gamma: 0 });
  assert.equal(await ready, true);
  assert.equal(sensor.listening(), false);
});
