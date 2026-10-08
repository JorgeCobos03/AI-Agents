import { runPipeline } from './engine.mjs';
let assets;
async function load() {
  const [modelResponse, wasmResponse] = await Promise.all([fetch('./model.json'), fetch('./planner.wasm')]);
  if (!modelResponse.ok || !wasmResponse.ok) throw Error('No se pudieron cargar los motores. Recarga la página.');
  const model = await modelResponse.json();
  const { instance } = await WebAssembly.instantiate(await wasmResponse.arrayBuffer());
  return { model, wasm: instance.exports };
}
self.onmessage = async ({ data }) => {
  try {
    assets ??= load().catch(error => { assets = null; throw error; });
    const runtime = await assets;
    const result = runPipeline({ ...data, ...runtime }, event => self.postMessage({ type: 'event', event }));
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
