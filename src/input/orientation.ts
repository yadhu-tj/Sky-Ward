/** Map sensor readings to the screen's left/right axis for both sampling and calibration. */
export function screenTiltDegrees(
  gamma: number | null,
  beta: number | null,
  landscape: boolean,
  orientation: number,
): number {
  if (!landscape) return gamma ?? 0;
  return orientation === 270 || orientation === -90 ? -(beta ?? 0) : (beta ?? gamma ?? 0);
}
