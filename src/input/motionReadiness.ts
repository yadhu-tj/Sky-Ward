export function hasMotionReading(event: Pick<DeviceOrientationEvent, 'beta' | 'gamma'>, landscape: boolean) {
  const value = landscape ? event.beta : event.gamma;
  return value !== null && Number.isFinite(value);
}

/** An API can exist on a device that never delivers sensor readings. */
export function waitForMotionReading(target: Window, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      target.clearTimeout(timer);
      target.removeEventListener('deviceorientation', handleReading);
      resolve(ready);
    };
    const handleReading = (event: DeviceOrientationEvent) => {
      if (hasMotionReading(event, target.innerWidth > target.innerHeight)) finish(true);
    };
    const timer = target.setTimeout(() => finish(false), timeoutMs);
    target.addEventListener('deviceorientation', handleReading);
  });
}
