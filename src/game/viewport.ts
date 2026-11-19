/** Keep world units proportional while fitting the complete bar at maximum tilt. */
export function mobileViewport(width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const worldWidth = Math.max(780, 420 * aspect);
  return { width: Math.round(worldWidth), height: Math.round(worldWidth / aspect) };
}

/** Keep the bar-to-lava distance consistent with the original 660px view. */
export function barScreenY(height: number, mobile: boolean) {
  return mobile ? height - 231 : height * 0.65;
}
