import { scenarios, labels } from './engine.mjs';
import { AgentScene } from './scene.mjs';

const $ = id => document.getElementById(id);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const agentNames = { coordinator: 'Coordinador', analyst: 'Analista', planner: 'Planificador', reviewer: 'Revisor' };
const agentDescriptions = {
  analyst: 'El analista busca pistas en cada texto para entender qué tipo de problema es.',
  planner: 'El planificador elige las tareas de mayor valor que caben en tus recursos.',
  reviewer: 'El revisor comprueba una propuesta y señala lo que necesita atención.',
};
const missionDescriptions = {
  launch: 'Seis problemas antes del lanzamiento. ¿Cuáles necesitan atención primero?',
  commerce: 'Una tienda tiene fallos, lentitud y riesgos. Ayuda a priorizar su atención.',
  uncertainty: 'No todos los reportes son claros. Descubre cuándo hace falta revisión humana.',
};
const idleActivities = { analyst: 'Explorando señales', planner: 'Conectando posibilidades', reviewer: 'Observando el conjunto' };
const activeActivities = { analyst: 'Clasificando problemas', planner: 'Calculando el mejor plan', reviewer: 'Revisando las decisiones' };
const AUTO_INTERVAL = 16000;
let tasks = structuredClone(scenarios.launch);
let mode = 'team', result = null, worker = null, busy = false;
let eventTimer = null, watchdog = null, changeTimer = null, autoTimer = null;
let pending = [], generation = 0, motionPaused = motionQuery.matches;
let autoplay = !motionQuery.matches, nextAuto = 0, completedRuns = 0;
const scene = new AgentScene($('agents-canvas'), { onUnavailable: () => { $('stage-fallback').hidden = false; } });

function status(text, running = false) {
  $('run-status').textContent = text;
  $('run-status').classList.toggle('running', running);
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderTable() {
  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    const tr = document.createElement('tr');
    const description = document.createElement('td');
    const id = document.createElement('code');
    id.textContent = task.id;
    description.append(id, document.createTextNode(task.text));
    tr.append(description);
    const analysis = result?.analyses.find(item => item.id === task.id);
    const classification = document.createElement('td');
    if (analysis) {
      const badge = document.createElement('span');
      badge.className = `badge ${analysis.label}`;
      badge.textContent = labels[analysis.label];
      const confidence = document.createElement('small');
      confidence.textContent = `${(analysis.confidence * 100).toFixed(1)}% · puntuación`;
      classification.append(badge, confidence);
    } else classification.textContent = '—';
    const hasPlan = result && (result.mode === 'team' || result.agent !== 'analyst');
    const selected = result?.selected.includes(task.id);
    tr.append(classification, cell(`${task.cost} u`), cell(String(task.impact)),
      cell(hasPlan ? selected ? '↗ Atender' : 'En espera' : 'Sin plan', selected ? 'chosen' : 'deferred'));
    fragment.append(tr);
  }
  $('incidents').replaceChildren(fragment);
  $('metric-tasks').textContent = String(tasks.length).padStart(2, '0');
}

function resetResult() {
  result = null;
  $('export').disabled = true;
  for (const id of ['metric-selected', 'metric-budget', 'metric-time']) $(id).textContent = '—';
  $('review-note').textContent = 'Al terminar verás qué propone el equipo y por qué.';
  $('review-note').classList.remove('warning');
  renderTable();
}

function setActive(agent = null) {
  scene.update({ active: agent });
  for (const id of ['analyst', 'planner', 'reviewer']) {
    $(`node-${id}`).classList.toggle('active', id === agent);
    $(`activity-${id}`).textContent = id === agent ? activeActivities[id] :
      mode === 'solo' && $('agent').value !== id ? 'En espera' : idleActivities[id];
  }
}

function setBusy(value) {
  busy = value;
  $('run').disabled = value;
  $('cancel').hidden = !value;
  $('custom-form').querySelector('button').disabled = value;
  // Scene selection and mission controls stay usable: changing either cancels
  // the old worker and starts a new bounded run with the current inputs.
}

function stop() {
  generation++;
  worker?.terminate();
  worker = null;
  clearTimeout(eventTimer);
  clearTimeout(watchdog);
  pending = [];
  setBusy(false);
  setActive(null);
}

function describeEvent(event) {
  if (event.action === 'dispatch') return `Recibimos ${tasks.length} problemas. Vamos a ${mode === 'team' ? 'resolverlos en equipo' : 'observar al ' + agentNames[$('agent').value].toLowerCase()}.`;
  if (event.action === 'classify') return event.detail.replace('puntuación posterior', 'puntuación del modelo');
  if (event.action === 'optimize') return 'Se calculó la combinación de problemas con mayor prioridad dentro del presupuesto.';
  if (event.action === 'proposal') return 'Se revisa una propuesta de ejemplo: atender los tres primeros problemas.';
  if (event.action === 'complete') return 'Misión terminada. Los resultados están listos para explorar.';
  return event.detail;
}

function showEvent(event) {
  const li = document.createElement('li');
  li.dataset.agent = event.agent;
  const seq = document.createElement('span');
  seq.className = 'seq'; seq.textContent = String(event.sequence).padStart(2, '0');
  const agent = document.createElement('span');
  agent.className = 'event-agent'; agent.textContent = agentNames[event.agent] || event.agent;
  const detail = document.createElement('span');
  detail.className = 'event-detail'; detail.textContent = describeEvent(event);
  li.append(seq, agent, detail);
  $('trace').append(li);
  $('trace').scrollTop = $('trace').scrollHeight;
  $('event-count').textContent = `${event.sequence} EVENTOS`;
  $('current-action').textContent = describeEvent(event);
  setActive(event.agent);
}

function finish(output) {
  result = output;
  stop();
  completedRuns++;
  renderTable();
  const hasPlan = result.mode === 'team' || result.agent !== 'analyst';
  $('metric-selected').textContent = hasPlan ? String(result.selected.length).padStart(2, '0') : '—';
  $('metric-budget').textContent = hasPlan ? `${result.used} / ${result.budget}` : '—';
  $('metric-time').textContent = `${result.elapsedMs.toFixed(1)} ms`;
  $('export').disabled = false;
  const review = result.review;
  if (review) {
    $('review-note').textContent = `${review.withinBudget ? '✓ El plan cabe en tus recursos.' : '⚠ Esta propuesta necesita más recursos de los disponibles.'} ${review.requiresHumanReview ? 'Algunos problemas no están claros: hace falta revisión humana.' : review.hasClassification ? 'El modelo no señaló falta de evidencia; sus categorías aún pueden contener errores.' : 'Se revisaron los tres primeros problemas, sin clasificación previa.'}`;
  } else {
    $('review-note').textContent = result.agent === 'analyst'
      ? '✓ Problemas clasificados. El analista individual no elige tareas ni revisa un plan.'
      : '✓ Plan calculado con los impactos originales. El analista y el revisor no participaron.';
  }
  $('review-note').classList.toggle('warning', !!review && (!review.withinBudget || review.requiresHumanReview));
  $('current-action').textContent = hasPlan ? `${result.selected.length} problemas seleccionados · ${result.used} de ${result.budget} unidades. Explora el resultado debajo.` : 'Clasificación lista. Compara las categorías en la mesa de resultados.';
  status('MISIÓN COMPLETA');
  scheduleAuto();
}

function drain() {
  if (!busy) return;
  const item = pending.shift();
  if (item?.type === 'event') showEvent(item.event);
  if (item?.type === 'result') return finish(item.result);
  // Visual playback has no effect on the reported compute time.
  eventTimer = setTimeout(drain, motionPaused ? 0 : item ? 620 : 60);
}

function fail(message) {
  stop();
  setAutoplay(false);
  status('REQUIERE ATENCIÓN');
  $('current-action').textContent = 'No se pudo completar esta misión. Puedes volver a intentarlo.';
  $('review-note').textContent = message;
  $('review-note').classList.add('warning');
}

function runMission() {
  clearTimeout(changeTimer);
  clearTimeout(autoTimer);
  stop();
  resetResult();
  $('trace').replaceChildren();
  $('event-count').textContent = '0 EVENTOS';
  setBusy(true);
  status('MISIÓN EN CURSO', true);
  $('auto-note').textContent = autoplay ? 'El equipo está trabajando' : 'Tú controlas cada ejecución';
  $('current-action').textContent = 'Preparando los datos de la misión…';
  const currentGeneration = generation;
  try {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (currentGeneration !== generation) return;
      if (data.type === 'error') fail(data.message);
      else pending.push(data);
    };
    worker.onerror = () => {
      if (currentGeneration === generation) fail('No se pudo iniciar el motor local. Recarga la página para volver a intentarlo.');
    };
    // Separate the compute/load timeout from the intentional visual playback.
    watchdog = setTimeout(() => {
      if (!pending.some(item => item.type === 'result')) fail('El motor tardó demasiado en responder. Puedes volver a intentarlo.');
    }, 15000);
    worker.postMessage({ tasks, budget: Number($('budget').value), mode, agent: $('agent').value });
    drain();
  } catch (error) { fail(error.message); }
}

function syncSelection() {
  for (const id of ['team', 'solo']) {
    $(id).classList.toggle('selected', mode === id);
    $(id).setAttribute('aria-pressed', String(mode === id));
  }
  $('agent').hidden = $('agent-label').hidden = mode === 'team';
  for (const id of ['analyst', 'planner', 'reviewer']) {
    const selected = mode === 'solo' && $('agent').value === id;
    $(`node-${id}`).setAttribute('aria-pressed', String(selected));
    $(`node-${id}`).classList.toggle('inactive', mode === 'solo' && !selected);
  }
  $('stage-message').textContent = mode === 'team'
    ? 'Tres especialidades, una misma misión. Selecciona un agente para verlo trabajar solo.'
    : agentDescriptions[$('agent').value];
  $('stage-mode').textContent = mode === 'team' ? 'EQUIPO / 03' : 'INDIVIDUAL / 01';
  scene.update({ mode, selected: $('agent').value, scenario: $('scenario').value });
  setActive(null);
}

function queueRun(delay = 160) {
  clearTimeout(changeTimer);
  clearTimeout(autoTimer);
  stop();
  resetResult();
  status('PREPARANDO MISIÓN');
  changeTimer = setTimeout(() => { if (!document.hidden) runMission(); }, delay);
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!autoplay || document.hidden || busy) return;
  nextAuto = Date.now() + AUTO_INTERVAL;
  const tick = () => {
    if (!autoplay || document.hidden || busy) return;
    const remaining = Math.ceil((nextAuto - Date.now()) / 1000);
    $('auto-note').textContent = `Siguiente misión en ${Math.max(0, remaining)} s`;
    if (remaining <= 0) runMission();
    else autoTimer = setTimeout(tick, 1000);
  };
  tick();
}

function setAutoplay(value) {
  autoplay = value;
  $('autoplay').setAttribute('aria-pressed', String(value));
  clearTimeout(autoTimer);
  $('auto-note').textContent = value ? 'Demo automática activada' : 'Tú controlas cada ejecución';
  if (value && !busy) scheduleAuto();
}

function applyMotion(value) {
  motionPaused = value;
  scene.setPaused(value);
  document.body.classList.toggle('motion-paused', value);
  $('motion').setAttribute('aria-pressed', String(value));
  $('motion').replaceChildren(document.createTextNode(value ? 'Activar movimiento ' : 'Pausar movimiento '));
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true'); icon.textContent = value ? '▷' : 'Ⅱ';
  $('motion').append(icon);
  $('motion').title = value ? 'Activar animaciones' : 'Pausar animaciones';
}

$('run').addEventListener('click', runMission);
$('cancel').addEventListener('click', () => {
  clearTimeout(changeTimer);
  stop(); resetResult(); setAutoplay(false);
  status('MISIÓN CANCELADA');
  $('current-action').textContent = 'Misión cancelada. Elige otra actividad cuando quieras.';
});
for (const next of ['team', 'solo']) $(next).addEventListener('click', () => {
  mode = next; syncSelection(); queueRun();
});
for (const id of ['analyst', 'planner', 'reviewer']) $(`node-${id}`).addEventListener('click', () => {
  mode = 'solo'; $('agent').value = id; syncSelection(); queueRun();
});
$('agent').addEventListener('change', () => { syncSelection(); queueRun(); });
$('scenario').addEventListener('change', () => {
  tasks = structuredClone(scenarios[$('scenario').value]);
  $('mission-summary').textContent = missionDescriptions[$('scenario').value];
  syncSelection(); queueRun();
});
$('budget').addEventListener('input', () => {
  $('budget-value').replaceChildren(document.createTextNode(`${$('budget').value} `));
  const unit = document.createElement('small'); unit.textContent = 'unidades'; $('budget-value').append(unit);
  queueRun(400);
});
$('autoplay').addEventListener('click', () => setAutoplay(!autoplay));
$('motion').addEventListener('click', () => applyMotion(!motionPaused));
motionQuery.addEventListener('change', event => {
  applyMotion(event.matches);
  if (event.matches) setAutoplay(false);
});
$('help-button').setAttribute('aria-expanded', 'false');
$('help-button').setAttribute('aria-controls', 'quick-help');
$('help-button').addEventListener('click', () => {
  $('quick-help').hidden = !$('quick-help').hidden;
  $('help-button').setAttribute('aria-expanded', String(!$('quick-help').hidden));
});
$('custom-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('custom-text').value.trim();
  if (tasks.length >= 20 || !text) {
    $('review-note').textContent = tasks.length >= 20 ? 'Esta misión admite hasta 20 problemas.' : 'Escribe una descripción del problema.';
    return;
  }
  tasks.push({ id: `INC-${String(tasks.length + 1).padStart(2, '0')}`, text, cost: Number($('custom-cost').value), impact: Number($('custom-impact').value) });
  $('custom-text').value = '';
  queueRun();
});
$('export').addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'ai-agents-run.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(autoTimer);
  if (document.hidden) {
    clearTimeout(changeTimer);
    if (busy) { stop(); status('MISIÓN PAUSADA'); $('current-action').textContent = 'La misión se pausó al salir de esta pestaña.'; }
  } else if (autoplay) {
    if (!completedRuns || !result) runMission();
    else scheduleAuto();
  }
});
window.addEventListener('pagehide', event => {
  clearTimeout(changeTimer); clearTimeout(autoTimer); stop();
  if (!event.persisted) scene.destroy();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  scene.sync();
  if (autoplay && !document.hidden) scheduleAuto();
});

renderTable();
syncSelection();
applyMotion(motionPaused);
setAutoplay(autoplay);
status('EQUIPO LISTO');
if (autoplay) {
  clearTimeout(autoTimer);
  $('auto-note').textContent = 'La primera misión está por comenzar';
  changeTimer = setTimeout(() => { if (!document.hidden) runMission(); }, 1200);
} else $('current-action').textContent = 'Movimiento reducido activado. Pulsa Ejecutar misión para comenzar.';
