import { useEffect, useState } from 'react';
import type { TrackerProgress } from '../hooks/handStartup';

export function TrackerStartup({ progress, mobile, onFallback }: { progress: TrackerProgress; mobile: boolean; onFallback: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = progress.stage === 'first-frame' ? performance.now() : progress.startedAt;
    const tick = () => setElapsed(Math.max(0, Math.floor((performance.now() - start) / 1000)));
    if (progress.stage === 'camera') { setElapsed(0); return; }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [progress.startedAt, progress.stage]);
  const label = progress.stage === 'downloading' ? 'Downloading hand tracking'
    : progress.stage === 'preparing' ? 'Preparing tracker on your device'
    : progress.stage === 'camera' ? 'Tracker prepared · Enable your camera'
    : progress.stage === 'first-frame' ? 'Checking the first camera frame'
    : progress.stage === 'error' ? 'Tracker could not finish loading' : 'Tracking ready';
  return <section className="tracker-startup" aria-label="Tracker startup">
    <div className="tracker-startup-heading"><strong role="status">{label}</strong><span aria-label="Loading window">{progress.stage === 'camera' ? 'READY' : elapsed >= 30 ? 'STILL LOADING' : `${Math.max(0, 30 - elapsed)}s`}</span></div>
    {progress.stage === 'downloading' ? <progress aria-label="Tracker files downloaded" value={progress.completed} max={progress.total || 6} /> : progress.stage === 'preparing' || progress.stage === 'first-frame' ? <progress aria-label="Preparing hand tracking" /> : null}
    <div className="tracker-startup-footer">
      <p>{elapsed >= 30 ? 'Taking longer than usual. Try another control.' : progress.stage === 'downloading' ? `${progress.completed}/${progress.total || 6} files · Cached for next time` : progress.stage === 'camera' ? 'Enable camera below to continue.' : 'Preparing tracking · 30s loading window'}</p>
      <button className="tracker-fallback" onClick={onFallback}>Play with {mobile ? 'Touch' : 'Keyboard'}</button>
    </div>
  </section>;
}
