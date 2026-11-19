import { handAssetUrl } from './handAssets';

export type TrackerStage = 'downloading' | 'preparing' | 'camera' | 'first-frame' | 'ready' | 'error';
export interface TrackerProgress { stage: TrackerStage; startedAt: number; completed: number; total: number; }

export async function warmHandAssets(lightweight: boolean, progress: (completed: number, total: number) => void) {
  const simd = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,9,1,7,0,65,0,253,15,26,11]));
  const variant = simd ? 'simd_wasm' : 'wasm';
  const files = [`hands_solution_${variant}_bin.js`, `hands_solution_${variant}_bin.wasm`,
    'hands_solution_packed_assets_loader.js', 'hands_solution_packed_assets.data', 'hands.binarypb',
    lightweight ? 'hand_landmark_lite.tflite' : 'hand_landmark_full.tflite'];
  let completed = 0;
  progress(0, files.length);
  await Promise.all(files.map(async file => {
    const response = await fetch(handAssetUrl(file), { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Tracker download failed (${response.status}): ${file}`);
    await response.blob();
    progress(++completed, files.length);
  }));
}
