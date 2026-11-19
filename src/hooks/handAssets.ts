// Bundle the runtime from the exact installed MediaPipe version, on the same origin.
import asset0 from '@mediapipe/hands/hand_landmark_full.tflite?url';
import asset1 from '@mediapipe/hands/hand_landmark_lite.tflite?url';
import asset2 from '@mediapipe/hands/hands_solution_packed_assets_loader.js?url';
import asset3 from '@mediapipe/hands/hands_solution_packed_assets.data?url';
import asset4 from '@mediapipe/hands/hands_solution_simd_wasm_bin.data?url';
import asset5 from '@mediapipe/hands/hands_solution_simd_wasm_bin.js?url';
import asset6 from '@mediapipe/hands/hands_solution_simd_wasm_bin.wasm?url';
import asset7 from '@mediapipe/hands/hands_solution_wasm_bin.js?url';
import asset8 from '@mediapipe/hands/hands_solution_wasm_bin.wasm?url';
import asset9 from '@mediapipe/hands/hands.binarypb?url';

const assets: Record<string, string> = {
  'hand_landmark_full.tflite': asset0,
  'hand_landmark_lite.tflite': asset1,
  'hands_solution_packed_assets_loader.js': asset2,
  'hands_solution_packed_assets.data': asset3,
  'hands_solution_simd_wasm_bin.data': asset4,
  'hands_solution_simd_wasm_bin.js': asset5,
  'hands_solution_simd_wasm_bin.wasm': asset6,
  'hands_solution_wasm_bin.js': asset7,
  'hands_solution_wasm_bin.wasm': asset8,
  'hands.binarypb': asset9,
};

export function handAssetUrl(file: string): string {
  if (!assets[file]) throw new Error(`Unknown hand tracking asset: ${file}`);
  return assets[file];
}
