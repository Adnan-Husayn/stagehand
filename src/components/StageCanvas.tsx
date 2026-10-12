"use client";

import { useEffect, useRef, type RefObject } from "react";

/** What the rest of the page can ask the lights to do. */
export interface StageRig {
  /** Lamps come up one at a time, each with a short flicker. */
  strike: (stagger?: number) => void;
  /** All lamps and the follow spot go out. */
  cut: () => void;
  /** A brief surge on one beam. */
  pulse: (index: number) => void;
  /** Beams sweep faster while a run is going. */
  search: (on: boolean) => void;
  /** Point the follow spot at a screen position. */
  aim: (clientX: number, clientY: number) => void;
}

interface Beam {
  x: number;
  a: number;
  sway: number;
  sp: number;
  ph: number;
  w: number;
  c: [number, number, number];
  lv: number;
  target: number;
  pulse: number;
  flick: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  p: number;
}

// Drawn at a quarter of the screen size and scaled up, which keeps it soft and cheap.
const SCALE = 0.25;
const MAX_DPR = 2;
// No pixel may be brighter than this, so text set straight on the canvas keeps its contrast.
const CEILING = "rgb(66,76,96)";

const BEAMS: Omit<Beam, "lv" | "target" | "pulse" | "flick">[] = [
  { x: 0.04, a: 0.36, sway: 0.1, sp: 0.00021, ph: 0.0, w: 0.15, c: [140, 184, 255] },
  { x: 0.29, a: 0.13, sway: 0.15, sp: 0.00016, ph: 1.7, w: 0.12, c: [168, 204, 255] },
  { x: 0.53, a: -0.03, sway: 0.12, sp: 0.00023, ph: 3.1, w: 0.13, c: [255, 190, 110] },
  { x: 0.76, a: -0.17, sway: 0.16, sp: 0.00018, ph: 4.4, w: 0.12, c: [156, 196, 255] },
  { x: 0.97, a: -0.38, sway: 0.1, sp: 0.00022, ph: 5.6, w: 0.15, c: [140, 184, 255] },
];

/**
 * The lighting rig behind the page: beams from above, haze, dust and a follow spot that tracks
 * the pointer or the focused control. Decorative only. One effect owns the frame loop.
 */
export function StageCanvas({ rigRef }: { rigRef: RefObject<StageRig | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Blur at this size is cheap. Without ctx.filter the beams are only a little crisper.
    const canBlur = "filter" in ctx;

    let W = 0;
    let H = 0;
    let k = 1;
    let clock = 0;
    let speed = 1;
    let speedTarget = 1;
    let raf = 0;
    let running = false;
    let last = 0;

    const beams: Beam[] = BEAMS.map((b) => ({ ...b, lv: 0, target: 0, pulse: 0, flick: 0 }));
    const spot = { x: 0.72, y: 0.5, tx: 0.72, ty: 0.5, lv: 0, target: 0 };
    const motes: Mote[] = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.1,
      vx: (Math.random() - 0.5) * 0.000016,
      vy: -(0.000006 + Math.random() * 0.000016),
      p: Math.random() * 6.28,
    }));
    const strikes = new Set<number>();

    function resize(cssW: number, cssH: number) {
      k = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      W = Math.max(140, Math.round(cssW * SCALE));
      H = Math.max(120, Math.round(cssH * SCALE));
      canvas!.width = Math.round(W * k);
      canvas!.height = Math.round(H * k);
      ctx!.setTransform(k, 0, 0, k, 0, 0);
    }

    function draw(t: number, dt: number) {
      const c = ctx!;
      speed += (speedTarget - speed) * 0.05;
      clock += dt * speed;
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#05070c";
      c.fillRect(0, 0, W, H);
      const floor = c.createLinearGradient(0, H * 0.5, 0, H);
      floor.addColorStop(0, "rgba(16,28,54,0)");
      floor.addColorStop(1, "rgba(16,28,54,.5)");
      c.fillStyle = floor;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = "lighter";
      if (canBlur) c.filter = `blur(${2.5 * k}px)`;

      for (const b of beams) {
        b.lv += (b.target - b.lv) * (b.target > b.lv ? 0.07 : 0.3);
        b.pulse *= 0.93;
        let flick = 1;
        if (b.flick > 0) {
          b.flick -= dt;
          flick = Math.random() > 0.4 ? 1 : 0.2;
        }
        const breathe = 0.7 + 0.3 * Math.sin(clock * 0.0005 + b.ph) ** 2;
        const I = b.lv * flick * breathe + b.pulse;
        if (I < 0.01) continue;
        const ang = b.a + Math.sin(clock * b.sp + b.ph) * b.sway;
        const ox = b.x * W;
        const oy = -H * 0.3;
        const len = H * 1.6;
        const dx = Math.sin(ang);
        const dy = Math.cos(ang);
        const ex = ox + dx * len;
        const ey = oy + dy * len;
        const [r, g, bl] = b.c;
        const grad = c.createLinearGradient(ox, oy, ex, ey);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${0.1 * I})`);
        grad.addColorStop(0.45, `rgba(${r},${g},${bl},${0.046 * I})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        c.fillStyle = grad;
        for (const f of [1, 0.78, 0.58, 0.4, 0.22]) {
          const hw = b.w * W * f;
          c.beginPath();
          c.moveTo(ox - 1.5 * f, oy);
          c.lineTo(ox + 1.5 * f, oy);
          c.lineTo(ex + dy * hw, ey - dx * hw);
          c.lineTo(ex - dy * hw, ey + dx * hw);
          c.closePath();
          c.fill();
        }
      }

      if (canBlur) c.filter = "none";
      spot.lv += (spot.target - spot.lv) * 0.05;
      spot.x += (spot.tx - spot.x) * 0.075;
      spot.y += (spot.ty - spot.y) * 0.075;
      if (spot.lv > 0.01) {
        const sx = spot.x * W;
        const sy = spot.y * H;
        const rad = Math.max(W, H) * 0.2;
        const pool = c.createRadialGradient(sx, sy, 0, sx, sy, rad);
        pool.addColorStop(0, `rgba(255,210,150,${0.1 * spot.lv})`);
        pool.addColorStop(1, "rgba(255,210,150,0)");
        c.fillStyle = pool;
        c.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
        const ox = W * 0.5;
        const oy = -H * 0.3;
        const cone = c.createLinearGradient(ox, oy, sx, sy);
        cone.addColorStop(0, `rgba(255,214,160,${0.1 * spot.lv})`);
        cone.addColorStop(1, `rgba(255,214,160,${0.02 * spot.lv})`);
        c.fillStyle = cone;
        const nx = sy - oy;
        const ny = -(sx - ox);
        const nl = Math.hypot(nx, ny) || 1;
        const hw = rad * 0.55;
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(sx + (nx / nl) * hw, sy + (ny / nl) * hw);
        c.lineTo(sx - (nx / nl) * hw, sy - (ny / nl) * hw);
        c.closePath();
        c.fill();
      }

      const lit = beams.reduce((sum, b) => sum + b.lv, 0) / beams.length;
      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -0.02) {
          m.y = 1.02;
          m.x = Math.random();
        }
        if (m.x < -0.02) m.x = 1.02;
        else if (m.x > 1.02) m.x = -0.02;
        const tw = 0.5 + 0.5 * Math.sin(t * 0.0011 + m.p);
        c.fillStyle = `rgba(214,230,255,${(0.04 + 0.12 * tw) * lit})`;
        c.beginPath();
        c.arc(m.x * W, m.y * H, m.r, 0, 6.283);
        c.fill();
      }

      // Last step: nothing may end up brighter than the ceiling.
      c.globalCompositeOperation = "darken";
      c.fillStyle = CEILING;
      c.fillRect(0, 0, W, H);
    }

    function frame(t: number) {
      if (!running) return;
      const dt = Math.min(48, t - last);
      last = t;
      draw(t, dt);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || document.hidden || motion.matches) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    /** With reduced motion the rig is one still frame: every lamp lit, the spot half up. */
    function still() {
      beams.forEach((b) => {
        b.lv = 1;
        b.target = 1;
      });
      spot.lv = 0.6;
      spot.target = 0.6;
      draw(performance.now(), 16);
    }

    function clearStrikes() {
      strikes.forEach((id) => window.clearTimeout(id));
      strikes.clear();
    }

    const rig: StageRig = {
      strike(stagger = 110) {
        if (motion.matches) return;
        clearStrikes();
        beams.forEach((b, i) => {
          const id = window.setTimeout(() => {
            strikes.delete(id);
            b.target = 1;
            b.flick = 190;
          }, i * stagger);
          strikes.add(id);
        });
        spot.target = 1;
      },
      cut() {
        if (motion.matches) return;
        clearStrikes();
        beams.forEach((b) => {
          b.target = 0;
        });
        spot.target = 0;
      },
      pulse(index) {
        const b = beams[((index % beams.length) + beams.length) % beams.length];
        b.pulse = Math.min(0.6, b.pulse + 0.45);
      },
      search(on) {
        speedTarget = on ? 4.2 : 1;
      },
      aim(clientX, clientY) {
        spot.tx = clientX / window.innerWidth;
        spot.ty = clientY / window.innerHeight;
      },
    };
    rigRef.current = rig;

    resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    if (motion.matches) still();
    else start();

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      resize(box.width, box.height);
      if (motion.matches) draw(performance.now(), 16);
    });
    observer.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => {
      if (motion.matches) {
        stop();
        clearStrikes();
        still();
      } else {
        // Back to live motion: keep the lamps up.
        spot.target = 1;
        beams.forEach((b) => {
          b.target = 1;
        });
        start();
      }
    };
    const onPointer = (event: PointerEvent) => rig.aim(event.clientX, event.clientY);
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches(":focus-visible")) return;
      const box = target.getBoundingClientRect();
      rig.aim(box.left + box.width / 2, box.top + box.height / 2);
    };

    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("focusin", onFocus);

    return () => {
      stop();
      clearStrikes();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("focusin", onFocus);
      rigRef.current = null;
    };
  }, [rigRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
