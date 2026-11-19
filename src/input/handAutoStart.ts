import type { GameEngine } from '../game/GameEngine';

type CountdownEngine = Pick<GameEngine, 'state' | 'countdownTimer' | 'changeState' | 'startGame'>;

/** Only owns camera-triggered starts; paused and finished runs require player action. */
export class HandAutoStart {
  private pending = false;

  update(engine: CountdownEngine, ready: boolean, blocked: boolean): 'started' | 'cancelled' | null {
    if (this.pending && engine.state !== 'COUNTDOWN') this.pending = false;
    if (this.pending && (!ready || blocked)) {
      this.pending = false;
      engine.countdownTimer = 0;
      engine.changeState('READY');
      return 'cancelled';
    }
    if (ready && !blocked && (engine.state === 'CALIBRATING' || engine.state === 'READY')) {
      this.pending = true;
      engine.startGame(false);
      return 'started';
    }
    return null;
  }
}
