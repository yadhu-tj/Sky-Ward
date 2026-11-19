import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const cache = new Map();
const sounds = new Proxy({}, { get: () => () => {} });
function load(path) {
  const url = new URL(path, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const exports = {};
  cache.set(url.href, exports);
  const output = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(output, { exports, require: (name) => name === './soundEffects' ? { soundEffects: sounds } : load(new URL(`${name}.ts`, url).href) });
  return exports;
}
const { GameEngine } = load('../src/game/GameEngine.ts');
const { HandAutoStart } = load('../src/input/handAutoStart.ts');

test('recognized and calibrated hands trigger one full 3-2-1 countdown', () => {
  const engine = new GameEngine();
  const starter = new HandAutoStart();
  assert.equal(starter.update(engine, true, false), 'started');
  assert.equal(engine.state, 'COUNTDOWN');
  assert.equal(engine.stats.countdownSeconds, 3);
  assert.equal(starter.update(engine, true, false), null);
  engine.update(1);
  assert.equal(engine.stats.countdownSeconds, 2);
  engine.update(1);
  assert.equal(engine.stats.countdownSeconds, 1);
  engine.update(1);
  assert.equal(engine.state, 'PLAYING');
  assert.equal(starter.update(engine, true, false), null);
  assert.equal(engine.timeElapsed, 0);
});

test('loss of tracking cancels the countdown and reacquisition starts again at 3', () => {
  const engine = new GameEngine();
  const starter = new HandAutoStart();
  starter.update(engine, true, false);
  engine.update(1);
  assert.equal(starter.update(engine, false, false), 'cancelled');
  assert.equal(engine.state, 'READY');
  assert.equal(engine.countdownTimer, 0);
  starter.update(engine, true, false);
  assert.equal(engine.stats.countdownSeconds, 3);
});

test('menus block automatic starts and cancel an active hand countdown', () => {
  const engine = new GameEngine();
  const starter = new HandAutoStart();
  assert.equal(starter.update(engine, true, true), null);
  assert.equal(engine.state, 'CALIBRATING');
  starter.update(engine, true, false);
  assert.equal(starter.update(engine, true, true), 'cancelled');
});

test('unrecognized hands, paused runs and finished runs do not automatically start', () => {
  const engine = new GameEngine();
  const starter = new HandAutoStart();
  assert.equal(starter.update(engine, false, false), null);
  for (const state of ['PAUSED', 'GAME_OVER', 'PLAYING']) {
    engine.changeState(state);
    assert.equal(starter.update(engine, true, false), null);
    assert.equal(engine.state, state);
  }
});

test('portal landing clears hazards in rows already generated and records warp score', () => {
  const engine = new GameEngine();
  engine.startGame(true);
  const slot = { slotIndex: 5, startX: 330, endX: 370, isPortal: true };
  const landing = { id: 'landing', worldY: 367, height: 36, slots: [{ ...slot, isPortal: false }] };
  engine.rows = [{ id: 'portal', worldY: 17, height: 36, slots: [slot] }, landing];
  engine.update(0);
  assert.equal(engine.portalsUsed, 1);
  assert.equal(engine.altitudePx, 350);
  assert.equal(landing.slots.length, 0);
  assert.equal(landing.isSafeZone, true);
  assert.equal(engine.stats.bestAltitudeMeters, 7);
  assert.equal(engine.stats.bestScore, 120);
  engine.startGame(true);
  assert.equal(engine.stats.bestScore, 120);
});

test('sector promotion bonuses are available again on the next run', () => {
  const engine = new GameEngine();
  for (let run = 0; run < 2; run++) {
    engine.startGame(true);
    engine.altitudePx = 1550;
    engine.update(0);
    assert.equal(engine.highestSectorReached, 2);
    assert.equal(engine.shieldTimer, 2.5);
    assert.ok(engine.promotionBannerTimer > 0);
  }
});

test('shield grace lasts until the ball clears the protected hole', () => {
  const engine = new GameEngine();
  engine.startGame(true);
  engine.rows = [{ id: 'hole', worldY: 17, height: 36, slots: [{ slotIndex: 5, startX: 330, endX: 370, isPortal: false }] }];
  engine.shieldTimer = .1;
  engine.update(0);
  assert.equal(engine.lavaFall, null);
  engine.shieldTimer = 0;
  engine.update(0);
  assert.equal(engine.lavaFall, null);
  engine.ball.x = 450;
  engine.update(0);
  engine.ball.x = 350;
  engine.update(0);
  assert.ok(engine.lavaFall);
});

test('a slow frame cannot let a fast ball tunnel through a hazard', () => {
  const engine = new GameEngine();
  engine.startGame(true);
  engine.ball.x = 200;
  engine.ball.velocity = 1400;
  engine.rows = [{ id: 'fast-hole', worldY: 20, height: 36, slots: [{ slotIndex: 4, startX: 250, endX: 290, isPortal: false }] }];
  engine.update(.1);
  assert.ok(engine.lavaFall);
  assert.equal(engine.deathReason, 'HOLE_FALL');
});

test('procedural rows stay ordered with safe slots and all milestone gateways', () => {
  const { LevelGenerator, SECTOR_DEFINITIONS } = load('../src/game/levelGenerator.ts');
  const generator = new LevelGenerator();
  generator.reset();
  const rows = generator.generateUpTo(25000, []);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].worldY > rows[i - 1].worldY);
  assert.equal(rows.filter((row) => row.isGateway).length, 4);
  for (const sector of SECTOR_DEFINITIONS) {
    for (let i = 0; i < 100; i++) {
      const row = generator.generateRow(sector.minWorldY + 300);
      assert.ok(10 - row.slots.length >= sector.minSafeSlots);
      if (row.isSafeZone) assert.equal(row.slots.length, 0);
    }
  }
});
