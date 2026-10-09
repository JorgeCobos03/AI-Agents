/**
 * Procedural particle scene rendered with Canvas 2D and perspective projection.
 * No textures, tracking, WebGL dependency, or external assets. Animation is
 * capped at 30fps, pauses outside the viewport, and honors reduced motion.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const AGENTS = [
  { id: 'analyst', rgb: [147, 197, 253], phase: 0 },
  { id: 'planner', rgb: [218, 252, 152], phase: 2.1 },
  { id: 'reviewer', rgb: [199, 173, 255], phase: 4.2 },
];
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const rgba = (rgb, alpha) => `rgba(${rgb.join(',')},${alpha})`;

export class AgentScene {
  constructor(canvas, { onUnavailable = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.state = { mode: 'team', selected: 'analyst', active: null, scenario: 'launch' };
    this.pointer = { x: 0, y: 0 };
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.motionQuery.matches;
    this.visible = true;
    this.time = 0;
    this.frame = 0;
    this.last = 0;
    this.disposed = false;
    this.energy = [0, 0, 0];
    this.listeners = new AbortController();
    if (!this.ctx) { onUnavailable(); return; }

    const signal = this.listeners.signal;
    canvas.parentElement.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = (event.clientX - rect.left) / rect.width - .5;
      this.pointer.y = (event.clientY - rect.top) / rect.height - .5;
      if (this.paused) this.render();
    }, { passive: true, signal });
    canvas.parentElement.addEventListener('pointerleave', () => {
      this.pointer = { x: 0, y: 0 };
      if (this.paused) this.render();
    }, { signal });
    document.addEventListener('visibilitychange', () => this.sync(), { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      this.sync();
    }, { rootMargin: '80px' });
    this.intersectionObserver.observe(canvas);
    this.resize();
  }

  resize() {
    if (!this.ctx || this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.count = this.width < 550 ? 260 : 520;
    this.render();
    this.sync();
  }

  update(next) {
    Object.assign(this.state, next);
    if (this.paused) {
      this.energy = AGENTS.map(agent => agent.id === this.state.active ? 1 : 0);
      this.render();
    }
  }

  setPaused(value) {
    this.paused = value;
    this.render();
    this.sync();
  }

  sync() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
    if (this.ctx && !this.disposed && !this.paused && this.visible && !document.hidden) {
      this.frame = requestAnimationFrame(now => this.tick(now));
    }
  }

  tick(now) {
    if (this.disposed) return;
    if (!this.last) this.last = now;
    if (now - this.last >= 1000 / 30) {
      this.time += Math.min((now - this.last) / 1000, .06);
      this.last = now;
      this.render();
    }
    this.frame = requestAnimationFrame(next => this.tick(next));
  }

  render() {
    if (!this.ctx || !this.width) return;
    const { ctx, width: w, height: h, time: t } = this;
    ctx.clearRect(0, 0, w, h);
    const centers = [.18, .5, .82].map(x => ({ x: w * x, y: h * .37 }));
    const radius = Math.min(w * .117, h * .235, 116);

    // The depth grid moves slowly under the agents, like a quiet tabletop.
    ctx.lineWidth = .6;
    for (let row = 0; row < 7; row++) {
      const y = h * .56 + row * 13;
      ctx.strokeStyle = `rgba(155,182,132,${.045 - row * .004})`;
      ctx.beginPath(); ctx.ellipse(w / 2, y, w * (.33 + row * .03), 18 + row * 3, 0, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 42; i++) {
      const x = ((i * 137.51 + t * (i % 2 ? 2 : -2)) % w + w) % w;
      const y = (i * 53.17) % (h * .67);
      const alpha = .08 + .09 * (1 + Math.sin(t * .6 + i)) / 2;
      ctx.fillStyle = `rgba(184,201,168,${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, i % 7 === 0 ? 1.2 : .6, 0, TAU); ctx.fill();
    }

    if (this.state.mode === 'team') {
      for (let i = 0; i < 2; i++) {
        const from = centers[i], to = centers[i + 1];
        const x1 = from.x + radius * .8, x2 = to.x - radius * .8;
        ctx.beginPath(); ctx.moveTo(x1, from.y + 12);
        ctx.bezierCurveTo(x1 + 20, from.y + 45, x2 - 20, to.y + 45, x2, to.y + 12);
        ctx.strokeStyle = rgba(AGENTS[i].rgb, .14); ctx.lineWidth = 1; ctx.stroke();
        for (let j = 0; j < 3; j++) {
          const progress = (t * .22 + j / 3) % 1;
          const x = mix(x1, x2, progress);
          const y = from.y + 12 + Math.sin(progress * Math.PI) * 25;
          ctx.fillStyle = rgba(AGENTS[i].rgb, .45);
          ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill();
        }
      }
    }

    AGENTS.forEach((agent, index) => {
      this.energy[index] = mix(this.energy[index], this.state.active === agent.id ? 1 : 0, .08);
      const energy = this.energy[index];
      const enabled = this.state.mode === 'team' || this.state.selected === agent.id;
      const alpha = enabled ? 1 : .23;
      const center = centers[index];
      const bob = Math.sin(t * .65 + agent.phase) * 5;
      const cx = center.x + this.pointer.x * 6;
      const cy = center.y + bob + this.pointer.y * 4;
      const r = radius * (1 + energy * .08);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.65);
      glow.addColorStop(0, rgba(agent.rgb, .075 * alpha));
      glow.addColorStop(.6, rgba(agent.rgb, .025 * alpha));
      glow.addColorStop(1, rgba(agent.rgb, 0));
      ctx.fillStyle = glow; ctx.fillRect(cx - r * 1.7, cy - r * 1.7, r * 3.4, r * 3.4);

      // A floor ring provides a visual anchor without obscuring the particle body.
      ctx.strokeStyle = rgba(agent.rgb, (.14 + energy * .14) * alpha);
      ctx.lineWidth = .75;
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.16, r * .95, r * .17, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(agent.rgb, .04 * alpha);
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.16, r * 1.15, r * .22, 0, 0, TAU); ctx.stroke();

      const rotation = t * (.13 + energy * .18) + agent.phase + this.pointer.x * .22;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      const tilt = -.22 + Math.sin(t * .2 + agent.phase) * .16 + this.pointer.y * .15;
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const particles = [];
      for (let i = 0; i < this.count; i++) {
        const v = 1 - 2 * (i + .5) / this.count;
        const circle = Math.sqrt(1 - v * v);
        const angle = GOLDEN_ANGLE * i;
        const wave = 1 + .045 * Math.sin(angle * 3 + t * 1.3 + v * 8 + agent.phase);
        let x = Math.cos(angle) * circle * wave;
        let y = v * wave;
        let z = Math.sin(angle) * circle * wave;

        // Different silhouettes express different roles. Activity smoothly
        // transforms each cloud: scan, organize, then inspect.
        if (index === 0) {
          const scan = .08 * Math.sin(v * 10 + t * (1 + energy));
          x *= 1 + scan; z *= 1 + scan; y *= .96;
        } else if (index === 1) {
          const u = angle, tube = i / this.count * TAU * 13;
          const torusX = (.72 + .28 * Math.cos(tube)) * Math.cos(u);
          const torusY = .42 * Math.sin(tube);
          const torusZ = (.72 + .28 * Math.cos(tube)) * Math.sin(u);
          const morph = .68 + energy * .25;
          x = mix(x, torusX, morph); y = mix(y, torusY, morph); z = mix(z, torusZ, morph);
          const twist = .35;
          const oldY = y; y = oldY * Math.cos(twist) - x * Math.sin(twist); x = oldY * Math.sin(twist) + x * Math.cos(twist);
        } else {
          const ripple = .08 * Math.cos(v * 7 + t * .7);
          x *= .85 + ripple; y *= 1.08; z *= .85 + ripple;
          if (energy > .01) { const fold = Math.abs(v); x *= 1 - energy * fold * .23; }
        }
        const rx = x * cosR + z * sinR;
        const rz = -x * sinR + z * cosR;
        const ry = y * cosT - rz * sinT;
        const depth = y * sinT + rz * cosT;
        const perspective = 3 / (3 - depth * .36);
        particles.push({ x: cx + rx * r * perspective, y: cy + ry * r * perspective, depth, i });
      }
      particles.sort((a, b) => a.depth - b.depth);
      for (const point of particles) {
        const front = (point.depth + 1.3) / 2.6;
        const spark = point.i % 19 === 0 ? 1.35 : 1;
        const size = (w < 550 ? .65 : .8) + front * .7;
        ctx.fillStyle = rgba(agent.rgb, (.16 + front * .69 + energy * .12) * alpha);
        ctx.beginPath(); ctx.arc(point.x, point.y, size * spark, 0, TAU); ctx.fill();
      }

      // Active scanning arc is directly tied to the recorded agent event.
      if (energy > .015) {
        ctx.strokeStyle = rgba(agent.rgb, energy * .45 * alpha);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.21, r * 1.12, -.3, t * .5, t * .5 + Math.PI * 1.2); ctx.stroke();
      }
    });
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.listeners.abort();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }
}
