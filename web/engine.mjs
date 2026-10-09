export const labels = { security: 'Seguridad', reliability: 'Disponibilidad', performance: 'Rendimiento', unknown: 'Sin evidencia' };
export const scenarios = {
  launch: [
    { id: 'INC-01', text: 'Un token privado y credenciales quedaron expuestos en un repositorio público', cost: 4, impact: 80 },
    { id: 'INC-02', text: 'La base de datos no responde: servicio no disponible tras el despliegue', cost: 3, impact: 72 },
    { id: 'INC-03', text: 'El panel carga lento por una consulta con alta latencia', cost: 2, impact: 52 },
    { id: 'INC-04', text: 'Se detectó acceso no autorizado a una cuenta de administrador', cost: 3, impact: 68 },
    { id: 'INC-05', text: 'El caché lento reduce el rendimiento de la aplicación', cost: 2, impact: 42 },
    { id: 'INC-06', text: 'Falló la recuperación del respaldo tras la caída del servidor', cost: 5, impact: 76 },
  ],
  commerce: [
    { id: 'INC-01', text: 'Consulta lenta con alta latencia', cost: 2, impact: 65 },
    { id: 'INC-02', text: 'Fuga de credenciales y secreto expuesto', cost: 5, impact: 82 },
    { id: 'INC-03', text: 'Servicio caído: error de conexión en base de datos', cost: 4, impact: 90 },
    { id: 'INC-04', text: 'Memoria saturada y cuello de botella', cost: 3, impact: 55 },
    { id: 'INC-05', text: 'Ataque phishing roba contraseña de cuenta', cost: 2, impact: 60 },
  ],
  uncertainty: [
    { id: 'INC-01', text: 'Algo extraño ocurrió ayer', cost: 2, impact: 30 },
    { id: 'INC-02', text: 'Login lento con timeout en la base de datos', cost: 3, impact: 60 },
    { id: 'INC-03', text: 'Malware roba una contraseña privada', cost: 4, impact: 85 },
    { id: 'INC-04', text: 'El usuario reporta algo inesperado', cost: 2, impact: 40 },
  ],
};

export function validate(tasks, budget) {
  if (!Number.isInteger(budget) || budget < 0 || budget > 100) throw Error('El presupuesto debe ser un entero entre 0 y 100.');
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 20) throw Error('Se permiten entre 1 y 20 incidentes.');
  const ids = new Set();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 500 || !Number.isInteger(t.cost) || t.cost < 1 || t.cost > 100 || !Number.isInteger(t.impact) || t.impact < 1 || t.impact > 100) throw Error('Incidente inválido: revisa texto, identificador, esfuerzo e impacto.');
    ids.add(t.id);
  }
}

export function predict(model, text) {
  const words = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) || [];
  const index = new Map(model.vocabulary.map((word, i) => [word, i]));
  const known = words.filter(word => index.has(word));
  const scores = model.logPrior.map((p, c) => p + known.reduce((sum, word) => sum + model.logLikelihood[c][index.get(word)], 0));
  const weights = scores.map(score => Math.exp(score - Math.max(...scores)));
  const probabilities = weights.map(w => w / weights.reduce((a, b) => a + b, 0));
  const best = probabilities.indexOf(Math.max(...probabilities));
  return { label: known.length ? model.labels[best] : 'unknown', confidence: probabilities[best], probabilities, knownTokens: known.length };
}

export function optimize(tasks, budget, wasm) {
  validate(tasks, budget);
  tasks.forEach((t, i) => { if (wasm.set_task(i, t.cost, t.impact) !== 0) throw Error('El motor C++ rechazó la entrada.'); });
  const mask = wasm.solve(tasks.length, budget);
  if (mask < 0) throw Error('El motor C++ no pudo resolver el plan.');
  return tasks.filter((_, i) => mask & (1 << i)).map(t => t.id);
}

export function runPipeline({ model, wasm, tasks, budget, mode = 'team', agent = 'analyst' }, emit = () => {}) {
  validate(tasks, budget);
  if (!['team', 'solo'].includes(mode) || !['analyst', 'planner', 'reviewer'].includes(agent)) throw Error('Modo no válido.');
  const start = performance.now();
  const events = [];
  const event = (from, action, detail) => { const e = { sequence: events.length + 1, agent: from, action, detail }; events.push(e); emit(e); };
  event('coordinator', 'dispatch', `${tasks.length} incidentes · ${budget} unidades · ${mode === 'team' ? 'equipo' : agent}`);
  const analyze = mode === 'team' || agent === 'analyst';
  const analyses = analyze ? tasks.map(t => ({ ...t, ...predict(model, t.text) })) : [];
  if (analyze) analyses.forEach(t => event('analyst', 'classify', `${t.id} → ${labels[t.label]} · ${(t.confidence * 100).toFixed(1)}% puntuación posterior`));
  const weighted = tasks.map(t => {
    const a = analyses.find(a => a.id === t.id);
    return { ...t, impact: Math.min(100, t.impact + (a?.label === 'security' && a.confidence >= .55 ? 15 : 0)) };
  });
  let selected = [];
  if (mode === 'team' || agent === 'planner') {
    selected = optimize(weighted, budget, wasm);
    event('planner', 'optimize', `C++ / Wasm · mochila 0/1 · seleccionados: ${selected.join(', ') || 'ninguno'}`);
  }
  // A solo reviewer audits an explicitly defined FIFO proposal, not an empty fake plan.
  if (mode === 'solo' && agent === 'reviewer') {
    selected = tasks.slice(0, 3).map(t => t.id);
    event('reviewer', 'proposal', `Auditar propuesta FIFO: ${selected.join(', ')}`);
  }
  const used = tasks.filter(t => selected.includes(t.id)).reduce((sum, t) => sum + t.cost, 0);
  let review = null;
  if (mode === 'team' || agent === 'reviewer') {
    review = { withinBudget: used <= budget, requiresHumanReview: analyses.some(t => t.confidence < .55 || t.label === 'unknown'), hasClassification: analyze };
    event('reviewer', 'verify', `${review.withinBudget ? 'Presupuesto válido' : 'Presupuesto excedido'} · ${review.requiresHumanReview ? 'requiere revisión humana por incertidumbre' : analyze ? 'sin alertas de incertidumbre' : 'clasificación no disponible'}`);
  }
  const utility = weighted.filter(t => selected.includes(t.id)).reduce((sum, t) => sum + t.impact, 0);
  event('coordinator', 'complete', 'Ejecución finalizada. No se ha modificado ningún sistema externo.');
  return { schemaVersion: 1, mode, agent, budget, tasks, analyses, weighted, selected, used, utility, review, events, elapsedMs: performance.now() - start, engine: 'C++20 / WebAssembly', model: model.algorithm };
}
