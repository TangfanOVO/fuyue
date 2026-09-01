"use client";

import { useEffect, useRef } from "react";
import { Bubbles, CircleOff, CloudRain, Heart, Leaf, PawPrint, Snowflake, Sparkles, SunDim } from "lucide-react";
import { AMBIENT_BUBBLE, AMBIENT_FIREFLY, AMBIENT_SHAPES } from "./ambient-shapes";

export type LineEffect = "none" | "snow" | "rain" | "heart" | "leaf" | "butterfly" | "star" | "bubble" | "glow" | "paw";
type AnimatedEffect = Exclude<LineEffect, "none">;

const EFFECTS: Record<AnimatedEffect, { count: number; size: [number, number]; alpha: [number, number] }> = {
  snow: { count: 34, size: [8, 20], alpha: [.16, .58] },
  rain: { count: 26, size: [8, 16], alpha: [.3, .6] },
  heart: { count: 18, size: [8, 18], alpha: [.22, .58] },
  leaf: { count: 16, size: [12, 27], alpha: [.28, .66] },
  butterfly: { count: 5, size: [15, 27], alpha: [.34, .62] },
  star: { count: 26, size: [6, 18], alpha: [.35, .9] },
  bubble: { count: 15, size: [9, 34], alpha: [.2, .5] },
  glow: { count: 18, size: [3.5, 7], alpha: [.5, .95] },
  paw: { count: 14, size: [13, 18], alpha: [.3, .58] },
};

const DENSITY = [.45, .72, 1, 1.38, 1.9] as const;
const RATE = [.55, .75, 1, 1.28, 1.75] as const;

type Particle = {
  kind: AnimatedEffect; el: HTMLSpanElement;
  size: number; a: number; ph: number; rot: number; sx: number; sy: number; sc: number; op: number;
  x: number; y: number; x0: number; y0: number; vx: number; vy: number; amp: number; f: number; drift: number;
  spin: number; life: number; age: number; ang: number; sn: number; cs: number; wob: number; gust: number;
  flipF: number; dir: number; sink: number; ff: number; dx: number; dy: number; popY: number; pop: number;
  ax: number; ay: number; f1: number; f2: number; f3: number; bf: number; bp: number; mx: number; my: number;
};

type PawWalk = { x: number; y: number; ang: number; spd: number; gap: number; timer: number; side: number };

function particle(kind: AnimatedEffect, el: HTMLSpanElement, size: number, alpha: number): Particle {
  return { kind, el, size, a: alpha, ph: Math.random() * Math.PI * 2, rot: 0, sx: 1, sy: 1, sc: 1, op: alpha,
    x: 0, y: 0, x0: 0, y0: 0, vx: 0, vy: 0, amp: 0, f: 0, drift: 0, spin: 0, life: 0, age: 0,
    ang: 0, sn: 0, cs: 0, wob: 0, gust: 0, flipF: 0, dir: 1, sink: 0, ff: 0, dx: 0, dy: 0,
    popY: 0, pop: -1, ax: 0, ay: 0, f1: 0, f2: 0, f3: 0, bf: 0, bp: 0, mx: 0, my: 0 };
}

function particleMarkup(kind: AnimatedEffect): string {
  if (kind === "bubble") return AMBIENT_BUBBLE;
  if (kind === "glow") return AMBIENT_FIREFLY;
  const shapes = AMBIENT_SHAPES[kind as keyof typeof AMBIENT_SHAPES];
  return shapes?.[Math.floor(Math.random() * shapes.length)] ?? "";
}

export function LineEffectGlyph({ effect }: { effect: LineEffect }) {
  if (effect === "none") return <CircleOff aria-hidden="true" />;
  if (effect === "snow") return <Snowflake aria-hidden="true" />;
  if (effect === "rain") return <CloudRain aria-hidden="true" />;
  if (effect === "heart") return <Heart aria-hidden="true" />;
  if (effect === "leaf") return <Leaf aria-hidden="true" />;
  if (effect === "butterfly") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 9c-1.7-4.5-4.3-6.3-6.4-5.1-2.2 1.2-1.3 5.5 2.4 7.4-3.4.1-4.9 2.3-3.5 4.5 1.3 2.1 5 1.1 7.5-2.5M12 9c1.7-4.5 4.3-6.3 6.4-5.1 2.2 1.2 1.3 5.5-2.4 7.4 3.4.1 4.9 2.3 3.5 4.5-1.3 2.1-5 1.1-7.5-2.5M12 8v9" /></svg>;
  if (effect === "star") return <Sparkles aria-hidden="true" />;
  if (effect === "bubble") return <Bubbles aria-hidden="true" />;
  if (effect === "paw") return <PawPrint aria-hidden="true" />;
  return <SunDim aria-hidden="true" />;
}

function AmbientEffectLayer({ effect, density, speed, theme }: { effect: AnimatedEffect; density: number; speed: number; theme: string }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.replaceChildren();
    const host = layer;
    const kind = effect;
    const conf = EFFECTS[kind]!;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const safeDensity = Math.max(1, Math.min(5, Math.round(density)));
    const safeSpeed = Math.max(1, Math.min(5, Math.round(speed)));
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = layer.clientWidth || 560;
    let height = layer.clientHeight || 700;
    let time = 0;
    let last = performance.now();
    let frame = 0;
    let parts: Particle[] = [];
    let walk: PawWalk | null = null;

    const color = () => getComputedStyle(host.closest(".app-shell") ?? host).getPropertyValue("--accent").trim() || "#7a3437";
    const darkAlphaLift = host.closest<HTMLElement>(".app-shell")?.dataset.mode === "dark" ? .14 : 0;
    const readableAlpha = (alpha: number) => Math.min(1, alpha + (1 - alpha) * darkAlphaLift);

    function seed(p: Particle, first: boolean) {
      switch (p.kind) {
        case "snow":
          p.x0 = rand(-20, width + 20); p.y = first ? rand(-height * .2, height) : rand(-70, -12);
          p.vy = rand(13, 30) * (.55 + p.size / 20); p.amp = rand(8, 42); p.f = rand(.22, .75);
          p.drift = rand(-7, 7); p.rot = rand(0, 360); p.spin = rand(-38, 38); break;
        case "paw":
          p.life = rand(2.4, 3.6); p.age = p.life + 1; p.op = 0; p.x = -999; p.y = -999; break;
        case "rain":
          p.ang = 0; p.sn = Math.sin(p.ang * Math.PI / 180); p.cs = Math.cos(p.ang * Math.PI / 180);
          p.vy = rand(55, 115) * (.7 + p.size / 30); p.x = rand(-8, width + 8);
          p.y = first ? rand(-height * .6, height) : rand(-150, -20); p.rot = -p.ang; p.sy = 1; break;
        case "heart":
          p.x0 = rand(-6, width + 6); p.y = first ? rand(-height * .25, height) : rand(-60, -14);
          p.vy = rand(20, 46); p.amp = rand(12, 46); p.f = rand(.24, .6); p.wob = rand(4, 11); break;
        case "leaf":
          p.x0 = rand(-10, width + 10); p.y = first ? rand(-height * .25, height) : rand(-60, -14);
          p.vy = rand(24, 62); p.amp = rand(14, 58); p.f = rand(.28, .72); p.rot = rand(0, 360);
          p.spin = rand(-150, 150); p.flipF = rand(.55, 1.6); p.gust = rand(-14, 14); break;
        case "butterfly":
          p.dir = Math.random() < .5 ? 1 : -1; p.y0 = rand(height * .1, height * .8);
          p.x = first ? rand(width * .05, width * .95) : p.dir > 0 ? -70 - rand(0, width * .9) : width + 70 + rand(0, width * .9);
          p.vx = rand(17, 38); p.amp = rand(12, 40); p.f = rand(.45, .95); p.sink = rand(-10, 10); p.ff = rand(5.5, 9); break;
        case "star":
          p.x = rand(width * .04, width * .96); p.y = rand(height * .04, height * .96); p.life = rand(.85, 2.1);
          p.age = first ? rand(0, p.life) : 0; p.dx = rand(-9, 9); p.dy = rand(-18, -3); p.rot = rand(0, 90); p.spin = rand(-26, 26); break;
        case "bubble":
          p.x0 = rand(0, width); p.y = first ? rand(height * .1, height) : height + rand(12, 140); p.vy = rand(15, 42);
          p.amp = rand(5, 26); p.f = rand(.4, 1.05); p.popY = rand(height * .04, height * .5); p.pop = -1; break;
        case "glow":
          p.x0 = rand(width * .1, width * .9); p.y0 = rand(height * .08, height * .92); p.ax = rand(22, 95); p.ay = rand(16, 72);
          p.f1 = rand(.1, .32); p.f2 = rand(.09, .3); p.f3 = rand(.5, 1.15); p.bf = rand(.45, 1.35);
          p.bp = rand(0, 6.28); p.mx = rand(-5, 5); p.my = rand(-4, 4); break;
      }
    }

    function paint(p: Particle) {
      const half = p.size / 2;
      p.el.style.transform = "translate3d(" + (p.x - half).toFixed(2) + "px," + (p.y - half).toFixed(2) + "px,0) rotate(" + p.rot.toFixed(2) + "deg) scale(" + (p.sx * p.sc).toFixed(3) + "," + (p.sy * p.sc).toFixed(3) + ")";
      p.el.style.opacity = p.op.toFixed(3);
    }

    function build() {
      host.replaceChildren();
      parts = [];
      const fragment = document.createDocumentFragment();
      const count = Math.max(2, Math.round(conf.count * (DENSITY[safeDensity - 1] ?? 1)));
      const tint = color();
      for (let index = 0; index < count; index += 1) {
        const el = document.createElement("span");
        const size = rand(conf.size[0], conf.size[1]);
        const p = particle(kind, el, size, readableAlpha(rand(conf.alpha[0], conf.alpha[1])));
        el.className = "ambient-particle ambient-particle-" + kind;
        el.style.width = size.toFixed(2) + "px";
        el.style.height = size.toFixed(2) + "px";
        el.style.color = tint;
        el.innerHTML = particleMarkup(kind);
        if (kind === "glow") el.style.filter = "drop-shadow(0 0 " + (size * 1.9).toFixed(1) + "px " + tint + ")";
        seed(p, true);
        if (reduced) {
          if (kind === "paw") { p.x = rand(24, width - 24); p.y = rand(24, height - 24); p.age = p.life * .28; p.op = p.a * .48; }
          if (kind === "star" || kind === "glow") p.op = p.a * .38;
        }
        paint(p);
        fragment.appendChild(el);
        parts.push(p);
      }
      host.appendChild(fragment);
      walk = kind === "paw" ? { x: rand(width * .25, width * .75), y: rand(height * .25, height * .75), ang: rand(0, 360), spd: 44, gap: .44, timer: 0, side: 1 } : null;
    }

    function step(p: Particle, dt: number) {
      let s = 0; let k = 0; let pulse = 0;
      switch (p.kind) {
        case "snow":
          p.y += p.vy * dt; p.rot += p.spin * dt; p.x0 += p.drift * dt; p.x = p.x0 + Math.sin(time * p.f + p.ph) * p.amp;
          if (p.y > height + 50) seed(p, false); break;
        case "paw":
          p.age += dt; k = p.age / p.life;
          if (k >= 1) { p.op = 0; p.sc = 1; break; }
          p.sc = .82 + .18 * Math.min(1, k / .07); p.op = p.a * Math.min(1, k / .05) * (k > .5 ? Math.max(0, 1 - (k - .5) / .5) : 1); break;
        case "rain":
          p.x += p.vy * p.sn * dt; p.y += p.vy * p.cs * dt; k = p.y / Math.max(1, height);
          p.op = p.a * Math.min(1, Math.max(0, k / .12)) * (k > .55 ? Math.max(0, 1 - (k - .55) / .5) : 1);
          if (p.y > height + 40) seed(p, false); break;
        case "heart":
          p.y += p.vy * dt; s = Math.sin(time * p.f + p.ph); p.x = p.x0 + s * p.amp; p.rot = s * p.wob;
          if (p.y > height + 40) seed(p, false); break;
        case "leaf":
          p.y += p.vy * dt; p.rot += p.spin * dt; p.x0 += p.gust * dt; p.x = p.x0 + Math.sin(time * p.f + p.ph) * p.amp;
          s = Math.cos(time * p.flipF + p.ph); p.sx = Math.abs(s) < .14 ? (s < 0 ? -.14 : .14) : s;
          if (p.y > height + 50) seed(p, false); break;
        case "butterfly":
          p.x += p.vx * p.dir * dt; p.y0 += p.sink * dt * .5; s = Math.sin(time * p.f + p.ph);
          p.y = p.y0 + s * p.amp + Math.sin(time * p.f * 2.4 + p.ph) * 5; p.rot = -Math.cos(time * p.f + p.ph) * 13 * p.dir;
          p.sx = p.dir * (.4 + .6 * Math.abs(Math.sin(time * p.ff + p.ph)));
          if (p.y0 < 12 || p.y0 > height - 24) p.sink = -p.sink;
          if ((p.dir > 0 && p.x > width + 90) || (p.dir < 0 && p.x < -90)) seed(p, false); break;
        case "star":
          p.age += dt; if (p.age > p.life) seed(p, false); k = p.age / p.life;
          pulse = Math.sin(Math.max(0, Math.min(1, k)) * Math.PI); p.x += p.dx * dt; p.y += p.dy * dt; p.rot += p.spin * dt;
          p.op = p.a * Math.pow(pulse, 1.4); p.sc = .3 + .8 * pulse; break;
        case "bubble":
          if (p.pop >= 0) {
            p.pop += dt;
            if (p.pop > .42) { p.pop = -1; seed(p, false); break; }
            p.sc = 1 + p.pop * 2.4; p.op = p.a * Math.max(0, 1 - p.pop / .42);
          } else {
            p.y -= p.vy * dt; k = Math.max(0, Math.min(1, (height - p.y) / Math.max(1, height)));
            p.x = p.x0 + Math.sin(time * p.f + p.ph) * p.amp * (.5 + k); p.sc = .92 + k * .22; p.op = p.a;
            if (p.y < p.popY) p.pop = 0;
          }
          break;
        case "glow":
          p.x0 += p.mx * dt; p.y0 += p.my * dt;
          if (p.x0 < width * .06 || p.x0 > width * .94) p.mx = -p.mx;
          if (p.y0 < height * .06 || p.y0 > height * .94) p.my = -p.my;
          p.x = p.x0 + Math.sin(time * p.f1 + p.ph) * p.ax + Math.sin(time * p.f3 + p.ph * 1.7) * 9;
          p.y = p.y0 + Math.cos(time * p.f2 + p.ph * .7) * p.ay + Math.cos(time * p.f3 * .8 + p.ph) * 7;
          pulse = Math.sin(time * p.bf + p.bp); p.op = pulse > 0 ? p.a * Math.pow(pulse, 1.7) : 0; p.sc = .65 + .5 * Math.max(0, pulse); break;
      }
    }

    function walkStep(dt: number) {
      if (!walk) return;
      walk.ang += Math.sin(time * .45 + 1.3) * 26 * dt;
      const radians = walk.ang * Math.PI / 180;
      walk.x += Math.cos(radians) * walk.spd * dt; walk.y += Math.sin(radians) * walk.spd * dt;
      if (walk.x < 26) { walk.x = 26; walk.ang = 180 - walk.ang; }
      if (walk.x > width - 26) { walk.x = width - 26; walk.ang = 180 - walk.ang; }
      if (walk.y < 26) { walk.y = 26; walk.ang = -walk.ang; }
      if (walk.y > height - 26) { walk.y = height - 26; walk.ang = -walk.ang; }
      walk.timer -= dt;
      if (walk.timer > 0) return;
      walk.timer = walk.gap;
      const p = parts.find((item) => item.age >= item.life);
      if (!p) return;
      const perpendicular = radians + Math.PI / 2;
      const offset = walk.side * (p.size * .42);
      p.x = walk.x + Math.cos(perpendicular) * offset; p.y = walk.y + Math.sin(perpendicular) * offset;
      p.rot = walk.ang + 90; p.sx = walk.side; p.age = 0; walk.side = -walk.side;
    }

    function tick(now: number) {
      const dt = Math.min(.05, (now - last) / 1000) * (RATE[safeSpeed - 1] ?? 1);
      last = now; time += dt;
      if (kind === "paw") walkStep(dt);
      for (const p of parts) { step(p, dt); paint(p); }
      frame = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || width;
      const nextHeight = host.clientHeight || height;
      if (Math.abs(nextWidth - width) < 2 && Math.abs(nextHeight - height) < 2) return;
      width = nextWidth; height = nextHeight; build();
    });
    observer.observe(host);
    build();
    if (!reduced) frame = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(frame); observer.disconnect(); host.replaceChildren(); };
  }, [density, effect, speed, theme]);

  return <div ref={layerRef} className="ambient-effect-layer" data-effect={effect} aria-hidden="true" />;
}

export function AmbientLines({ effect, effects, density, speed, theme }: { effect?: LineEffect; effects?: readonly LineEffect[]; density: number; speed: number; theme: string }) {
  const supplied = effects ?? (effect ? [effect] : []);
  const selected = [...new Set(supplied.filter((item): item is AnimatedEffect => item !== "none"))];
  const layerDensity = Math.max(1, density - Math.ceil(Math.log2(Math.max(1, selected.length))));
  return <div className="ambient-lines" data-effect={selected.join(",") || "none"} aria-hidden="true">
    {selected.map((item) => <AmbientEffectLayer key={item} effect={item} density={layerDensity} speed={speed} theme={theme} />)}
  </div>;
}
