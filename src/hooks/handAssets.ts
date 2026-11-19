// Preserve sibling filenames used internally by the legacy Emscripten runtime.
export function handAssetUrl(file: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(file)) throw new Error('Invalid hand tracking asset');
  return new URL(`${import.meta.env.BASE_URL}mediapipe/hands-0.4.1675469240/${file}`, window.location.href).href;
}
