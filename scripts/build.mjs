import { readFile, stat } from 'node:fs/promises';
const files = ['index.html', 'style.css', 'app.mjs', 'engine.mjs', 'worker.mjs', 'model.json', 'planner.wasm'];
let total = 0;
for (const file of files) total += (await stat(new URL(`../web/${file}`, import.meta.url))).size;
const bytes = await readFile(new URL('../web/planner.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes);
if (instance.exports.set_task(0, 2, 10) !== 0 || instance.exports.solve(1, 2) !== 1) throw Error('Wasm smoke test failed');
if (total > 250_000) throw Error(`Static asset budget exceeded: ${total}`);
console.log(`Static build verified: ${files.length} assets, ${total} bytes. No server functions.`);
