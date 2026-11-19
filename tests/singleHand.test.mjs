import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/input/singleHandController.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports });
const { SingleHandController, palmRollDegrees } = exports;
function hand(angle, shiftX = 0, shiftY = 0) {
  const points = Array.from({ length: 21 }, () => ({ x: .5 + shiftX, y: .7 + shiftY, z: 0 }));
  const rad = angle * Math.PI / 180;
  points[9] = { x: .5 + shiftX + Math.sin(rad) * .2 / (16 / 9), y: .7 + shiftY - Math.cos(rad) * .2, z: 0 };
  return points;
}
function calibrate(angle = 0, side = 'left') {
  const controller = new SingleHandController();
  let state;
  for (let now = 0; now <= 720; now += 30) state = controller.process({ left: null, right: null, [side]: hand(angle) }, now);
  assert.equal(state.isCalibrated, true);
  return controller;
}

test('one visible palm calibrates without a second hand', () => {
  const controller = calibrate();
  const state = controller.process({ left: hand(0), right: null }, 750);
  assert.equal(state.isSingleHandMode, true);
  assert.equal(state.hasBothHands, false);
  assert.equal(state.finalAngleRad, 0);
});

test('palm lean direction is independent of which hand is tracked', () => {
  for (const side of ['left', 'right']) {
    for (const sign of [-1, 1]) {
      const controller = calibrate(0, side);
      let state;
      for (let now = 750; now < 1700; now += 30) state = controller.process({ left: null, right: null, [side]: hand(sign * 20) }, now);
      assert.equal(Math.sign(state.finalAngleDeg), sign);
      assert.ok(Math.abs(state.finalAngleDeg) <= 25);
      assert.equal(state.palmPauseTriggered, false);
    }
  }
});

test('raising or translating the hand does not change steering', () => {
  const controller = calibrate(10);
  const state = controller.process({ left: hand(10, .15, -.2), right: null }, 750);
  assert.ok(Math.abs(state.finalAngleDeg) < .001);
});

test('unstable hand movement restarts calibration', () => {
  const controller = new SingleHandController();
  for (let now = 0; now < 600; now += 30) controller.process({ left: hand(0), right: null }, now);
  const state = controller.process({ left: hand(20), right: null }, 600);
  assert.equal(state.isCalibrated, false);
  assert.equal(state.calibrationProgress, 0);
});

test('tracking dropout holds briefly, levels gently, then requests pause', () => {
  const controller = calibrate();
  for (let now = 750; now <= 1500; now += 30) controller.process({ left: hand(20), right: null }, now);
  const last = controller.heldAngleRad(1500);
  assert.ok(last > 0);
  assert.equal(controller.heldAngleRad(1600), last);
  assert.ok(controller.heldAngleRad(2000) < last);
  assert.equal(controller.heldAngleRad(2400), 0);
  assert.equal(controller.shouldPause(3000), false);
  assert.equal(controller.shouldPause(3001), true);
});

test('reacquiring a hand stops the tracking-loss pause condition', () => {
  const controller = calibrate();
  assert.equal(controller.shouldPause(2500), true);
  controller.process({ left: hand(0), right: null }, 2600);
  assert.equal(controller.shouldPause(2600), false);
});

test('invalid palms do not calibrate and reset clears the neutral', () => {
  assert.equal(palmRollDegrees(null), null);
  assert.equal(palmRollDegrees(hand(110)), null);
  const controller = calibrate();
  controller.resetCalibration();
  const state = controller.process({ left: null, right: null }, 1000);
  assert.equal(state.isCalibrated, false);
  assert.equal(state.finalAngleRad, 0);
  assert.equal(state.palmPauseTriggered, false);
});
