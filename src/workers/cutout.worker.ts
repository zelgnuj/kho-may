/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

/* ======================================================================
 * Chạy mô hình tách nền ngoài luồng giao diện (app không bị đơ khi đang tách).
 * Chạy bằng CPU (WebAssembly). Bản WebGPU của onnxruntime chưa chạy ổn trong
 * Web Worker nên chưa dùng; khi ổn định có thể bật để tách nhanh hơn nhiều.
 * ====================================================================== */

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;

export interface ModelSpec { size: number; mean: number[]; std: number[] }
export type InMsg =
  | { type: 'load'; model: ArrayBuffer | string; spec: ModelSpec }
  | { type: 'run'; id: number; rgba: Uint8ClampedArray };
export type OutMsg =
  | { type: 'loaded'; backend: 'wasm' }
  | { type: 'result'; id: number; mask: Float32Array }
  | { type: 'error'; id?: number; message: string };

let session: ort.InferenceSession | null = null;
let spec: ModelSpec | null = null;

const post = (m: OutMsg, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

async function infer(rgba: Uint8ClampedArray) {
  const { size, mean, std } = spec!;
  const n = size * size;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) data[c * n + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
  }
  const res = await session!.run({ [session!.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, size, size]) });
  const raw = res[session!.outputNames[0]].data as Float32Array;
  return new Float32Array(raw.subarray(0, n));
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      spec = m.spec;
      session = typeof m.model === 'string'
        ? await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] })
        : await ort.InferenceSession.create(new Uint8Array(m.model), { executionProviders: ['wasm'] });
      post({ type: 'loaded', backend: 'wasm' });
    } else if (m.type === 'run') {
      const mask = await infer(m.rgba);
      post({ type: 'result', id: m.id, mask }, [mask.buffer]);
    }
  } catch (err) {
    post({ type: 'error', id: m.type === 'run' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
