import { scenarios, labels } from './engine.mjs';
const $ = id => document.getElementById(id);
let tasks = structuredClone(scenarios.launch), mode = 'team', result = null, worker = null, timer = null, watchdog = null, pending = [], busy = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function status(text, running = false) { $('run-status').textContent = text; $('run-status').classList.toggle('running', running); }
function cell(text, className) { const td = document.createElement('td'); td.textContent = text; if (className) td.className = className; return td; }
function renderTable() {
  $('incidents').replaceChildren();
  for (const task of tasks) {
    const tr = document.createElement('tr'), description = document.createElement('td'), id = document.createElement('code');
    id.textContent = task.id; description.append(id, document.createTextNode(task.text)); tr.append(description);
    const analysis = result?.analyses.find(a => a.id === task.id), classification = document.createElement('td');
    if (analysis) { const badge = document.createElement('span'); badge.className = `badge ${analysis.label}`; badge.textContent = labels[analysis.label]; const confidence = document.createElement('small'); confidence.textContent = `${(analysis.confidence * 100).toFixed(1)}% posterior`; classification.append(badge, confidence); } else classification.textContent = '—';
    const hasPlan = result && (result.mode === 'team' || result.agent !== 'analyst');
    const selected = result?.selected.includes(task.id);
    tr.append(classification, cell(`${task.cost} u`), cell(String(task.impact)), cell(hasPlan ? selected ? '↗ Seleccionado' : 'En espera' : 'Sin plan', selected ? 'chosen' : 'deferred')); $('incidents').append(tr);
  }
  $('metric-tasks').textContent = String(tasks.length).padStart(2, '0');
}
function resetResult() { result = null; $('export').disabled = true; for (const id of ['metric-selected', 'metric-budget', 'metric-time']) $(id).textContent = '—'; $('review-note').textContent = 'El plan y la clasificación aparecerán aquí al terminar.'; $('review-note').classList.remove('warning'); renderTable(); }
function setBusy(value) { busy = value; for (const id of ['run', 'scenario', 'team', 'solo', 'agent', 'budget']) $(id).disabled = value; $('cancel').hidden = !value; for (const control of $('custom-form').elements) control.disabled = value; }
function stop() { worker?.terminate(); worker = null; clearTimeout(timer); clearTimeout(watchdog); pending = []; setBusy(false); document.querySelectorAll('.agent-node').forEach(n => n.classList.remove('active')); }
function showEvent(event) { const li = document.createElement('li'), seq = document.createElement('span'), agent = document.createElement('span'), detail = document.createElement('span'); seq.className = 'seq'; seq.textContent = String(event.sequence).padStart(2, '0'); agent.className = 'event-agent'; agent.textContent = event.agent; detail.textContent = event.detail; li.append(seq, agent, detail); $('trace').append(li); $('trace').scrollTop = $('trace').scrollHeight; $('event-count').textContent = `${event.sequence} EVENTOS`; document.querySelectorAll('.agent-node').forEach(n => n.classList.toggle('active', n.id === `node-${event.agent}`)); }
function finish(output) { result = output; stop(); renderTable(); const hasPlan = result.mode === 'team' || result.agent !== 'analyst'; $('metric-selected').textContent = hasPlan ? String(result.selected.length).padStart(2, '0') : '—'; $('metric-budget').textContent = hasPlan ? `${result.used} / ${result.budget}` : '—'; $('metric-time').textContent = `${result.elapsedMs.toFixed(1)} ms`; $('export').disabled = false; const r = result.review; $('review-note').textContent = r ? `${r.withinBudget ? '✓ Presupuesto verificado' : '⚠ La propuesta excede el presupuesto'} · ${r.requiresHumanReview ? 'Hay incidentes con evidencia insuficiente: se requiere revisión humana.' : r.hasClassification ? 'Sin alertas de incertidumbre del modelo.' : 'Auditoría individual de propuesta FIFO; sin clasificación.'} Prioridad seleccionada: ${result.utility}.` : result.agent === 'analyst' ? 'Clasificación individual finalizada. No se ejecutaron planificación ni revisión.' : `Plan individual con impactos originales. Prioridad seleccionada: ${result.utility}. Sin revisión posterior.`; $('review-note').classList.toggle('warning', !!r && (!r.withinBudget || r.requiresHumanReview)); status('EJECUCIÓN COMPLETA'); }
function drain() { if (!busy) return; const item = pending.shift(); if (item?.type === 'event') showEvent(item.event); if (item?.type === 'result') return finish(item.result); timer = setTimeout(drain, reducedMotion ? 0 : 180); }
function fail(message) { stop(); status('ERROR DE EJECUCIÓN'); $('review-note').textContent = message; $('review-note').classList.add('warning'); }
$('run').addEventListener('click', () => {
  stop(); resetResult(); $('trace').replaceChildren(); $('event-count').textContent = '0 EVENTOS'; setBusy(true); status('AGENTES EN EJECUCIÓN', true);
  try {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { if (data.type === 'error') fail(data.message); else pending.push(data); };
    worker.onerror = () => fail('No se pudo iniciar el motor local. Comprueba que WebAssembly y Web Workers estén habilitados y recarga la página.');
    watchdog = setTimeout(() => fail('La ejecución superó 15 segundos. Puedes volver a intentarlo.'), 15000);
    worker.postMessage({ tasks, budget: Number($('budget').value), mode, agent: $('agent').value }); drain();
  } catch (error) { fail(error.message); }
});
$('cancel').addEventListener('click', () => { stop(); resetResult(); status('EJECUCIÓN CANCELADA'); });
function highlight() { document.querySelectorAll('.agent-node').forEach(n => n.classList.toggle('inactive', mode === 'solo' && n.id !== `node-${$('agent').value}`)); }
for (const next of ['team', 'solo']) $(next).addEventListener('click', () => { mode = next; for (const key of ['team', 'solo']) { $(key).classList.toggle('selected', key === next); $(key).setAttribute('aria-pressed', String(key === next)); } $('agent').hidden = $('agent-label').hidden = mode === 'team'; highlight(); resetResult(); status('LISTO PARA EJECUTAR'); });
$('agent').addEventListener('change', () => { highlight(); resetResult(); });
$('scenario').addEventListener('change', () => { tasks = structuredClone(scenarios[$('scenario').value]); resetResult(); status('LISTO PARA EJECUTAR'); $('trace').replaceChildren(); $('event-count').textContent = '0 EVENTOS'; });
$('budget').addEventListener('input', () => { $('budget-value').textContent = `${$('budget').value} u`; resetResult(); });
$('custom-form').addEventListener('submit', event => { event.preventDefault(); const text = $('custom-text').value.trim(); if (tasks.length >= 20 || !text) { $('review-note').textContent = tasks.length >= 20 ? 'Se permiten hasta 20 incidentes.' : 'Escribe una descripción.'; return; } tasks.push({ id: `INC-${String(tasks.length + 1).padStart(2, '0')}`, text, cost: Number($('custom-cost').value), impact: Number($('custom-impact').value) }); $('custom-text').value = ''; resetResult(); status('LISTO PARA EJECUTAR'); });
$('export').addEventListener('click', () => { if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ai-agents-run.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
renderTable();
