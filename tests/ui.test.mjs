import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(path, replacements = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(output, { exports, require: (name) => replacements[name] ?? require(name) });
  return exports;
}
const { Webcam } = load('../src/components/Webcam.tsx');
const { LandscapeCockpit } = load('../src/components/LandscapeCockpit.tsx', { './Webcam': { Webcam } });
const { GameCanvas } = load('../src/game/GameCanvas.tsx', { './soundEffects': { soundEffects: {} } });
const engine = { state: 'CALIBRATING', stats: {}, ball: { x: 350 }, bar: { angleRad: 0 }, floorGap: 380 };
const props = { engine, tiltAngleRad: 0, isCalibrated: false, onStartGame() {}, onSkipCalibrationAndStart() {}, onRestart() {}, onTogglePause() {} };

test('desktop start retains the arcade tutorial and offers keyboard and camera', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, { ...props, controlMode: 'KEYBOARD' }));
  assert.match(html, /SKYWARD ROLL/);
  assert.match(html, /CATCH WARPS/);
  assert.match(html, /Keyboard/);
  assert.match(html, /Camera/);
  assert.doesNotMatch(html, /Phone tilt|QUICK PLAY|MANUAL/);
  assert.equal((html.match(/class="btn-start"/g) ?? []).length, 1);
});

test('phone start offers touch, phone tilt and camera controls', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, { ...props, isMobile: true, controlMode: 'TOUCH' }));
  assert.match(html, /Touch/);
  assert.match(html, /Phone tilt/);
  assert.match(html, /Camera/);
  assert.doesNotMatch(html, />Keyboard</);
});

test('camera preview reports waiting for hands without implying recording', () => {
  const html = renderToStaticMarkup(React.createElement(Webcam, { state: { isHandTrackingActive: false }, cameraActive: true }));
  assert.match(html, /Waiting for hands/);
  assert.doesNotMatch(html, /REC 60FPS|Calibrated/);
});

test('pregame sidebar retains the tilt instrument and hides score and pause', () => {
  const html = renderToStaticMarkup(React.createElement(LandscapeCockpit, {
    engine, state: {}, controlMode: 'HAND_CAM', isKeyboardSteering: false,
  }));
  assert.match(html, /TILT-O-METER/);
  assert.doesNotMatch(html, /Pause game|HI-SCORE|flight-stats/);
});
