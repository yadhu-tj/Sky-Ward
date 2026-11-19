import { useEffect, useState } from 'react';
import type { TrackerProgress } from '../hooks/handStartup';

export function TrackerStartup({ progress, mobile, onFallback }: { progress: TrackerProgress; mobile: boolean; onFallback: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((performance.now() - progress.startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [progress.startedAt]);
  const label = progress.stage === 'downloading' ? 'Downloading hand tracking'
    : progress.stage === 'preparing' ? 'Preparing tracker on your device'
    : progress.stage === 'camera' ? 'Tracker prepared · Enable your camera'
    : progress.stage === 'first-frame' ? 'Checking the first camera frame'
    : progress.stage === 'error' ? 'Tracker could not finish loading' : 'Tracking ready';
  return <section className="tracker-startup" aria-label="Tracker startup">
    <div className="tracker-startup-heading"><strong role="status">{label}</strong><span>{elapsed}s</span></div>
    {progress.stage === 'downloading' ? <progress aria-label="Tracker files downloaded" value={progress.completed} max={progress.total || 6} /> : progress.stage === 'preparing' || progress.stage === 'first-frame' ? <progress aria-label="Preparing hand tracking" /> : null}
    <p>{progress.stage === 'downloading' ? `${progress.completed}/${progress.total || 6} files · Downloads are cached for future visits.` : progress.stage === 'camera' ? 'Your hand will be checked after camera access is enabled.' : 'Your browser is setting up the camera model. There is no need to hold your hand up yet.'}</p>
    {elapsed >= 15 && <p className="tracker-slow-note">Taking longer than usual? You can play immediately with another control.</p>}
    <button className="secondary-action" onClick={onFallback}>Play with {mobile ? 'Touch' : 'Keyboard'}</button>
  </section>;
}
