import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { predict, optimize, validate, runPipeline, scenarios } from '../web/engine.mjs';
const model = JSON.parse(await readFile(new URL('../web/model.json', import.meta.url)));
const bytes = await readFile(new URL('../web/planner.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes);
const wasm = instance.exports;

test('bilingual learned inference and abstention on unseen vocabulary', () => {
  assert.equal(predict(model, 'private token password leak').label, 'security');
  assert.equal(predict(model, 'consulta lenta alta latencia').label, 'performance');
  assert.equal(predict(model, 'database offline unavailable').label, 'reliability');
  assert.equal(predict(model, 'xyzzy quux').label, 'unknown');
  assert.ok(Math.abs(predict(model, 'cache').probabilities.reduce((a,b)=>a+b,0) - 1) < 1e-12);
});
test('C++ Wasm optimizer matches exhaustive search across 120 generated problems', () => {
  let seed = 42;
  const random = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 120; trial++) {
    const tasks = Array.from({length: 1 + random(9)}, (_, i) => ({id: String(i), text: 'test', cost: 1 + random(10), impact: 1 + random(100)}));
    const budget = random(21);
    const selected = optimize(tasks, budget, wasm);
    const actual = tasks.filter(t=>selected.includes(t.id));
    assert.ok(actual.reduce((s,t)=>s+t.cost,0) <= budget);
    let best = 0;
    for(let bits=0;bits<2**tasks.length;bits++) {
      const subset=tasks.filter((_,i)=>bits & (1<<i));
      if(subset.reduce((s,t)=>s+t.cost,0)<=budget) best=Math.max(best,subset.reduce((s,t)=>s+t.impact,0));
    }
    assert.equal(actual.reduce((s,t)=>s+t.impact,0), best);
  }
});
test('bounds, invalid input, zero budget and full 20 task bitmask', () => {
  assert.equal(wasm.set_task(20, 1, 1), -1);
  assert.equal(wasm.set_task(0, -1, 1), -1);
  assert.equal(wasm.solve(21, 10), -1);
  assert.equal(wasm.solve(1, 101), -1);
  assert.throws(()=>validate(scenarios.launch, 2.5));
  assert.throws(()=>validate([{id:'x',text:'a',cost:0,impact:20}],2));
  assert.throws(()=>validate([scenarios.launch[0],scenarios.launch[0]],2));
  assert.deepEqual(optimize(scenarios.launch,0,wasm),[]);
  const tasks=Array.from({length:20},(_,i)=>({id:String(i),text:'task',cost:1,impact:1}));
  assert.equal(optimize(tasks,20,wasm).length,20);
});
test('collaboration consumes learned classifications; solo planner does not', () => {
  const tasks=[{id:'a',text:'token password leak',cost:3,impact:70},{id:'b',text:'slow latency query',cost:3,impact:80}];
  const team=runPipeline({model,wasm,tasks,budget:3});
  const solo=runPipeline({model,wasm,tasks,budget:3,mode:'solo',agent:'planner'});
  assert.deepEqual(team.selected,['a']);
  assert.deepEqual(solo.selected,['b']);
  assert.equal(team.review.withinBudget,true);
  assert.deepEqual(team.events.map(e=>e.sequence),[1,2,3,4,5,6]);
  assert.equal(solo.analyses.length,0);
});
test('individual reviewer detects over-budget FIFO proposal; unknown text flags human review', () => {
  const reviewed=runPipeline({model,wasm,tasks:scenarios.launch,budget:1,mode:'solo',agent:'reviewer'});
  assert.equal(reviewed.review.withinBudget,false);
  const unknown=runPipeline({model,wasm,tasks:scenarios.uncertainty,budget:5});
  assert.equal(unknown.review.requiresHumanReview,true);
  const analyst=runPipeline({model,wasm,tasks:scenarios.launch,budget:5,mode:'solo',agent:'analyst'});
  assert.deepEqual(analyst.selected,[]);
  assert.equal(analyst.review,null);
});
