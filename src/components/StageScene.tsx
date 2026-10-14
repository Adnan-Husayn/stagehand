"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import { prefersReducedMotion } from "./motion";

/** What the rest of the page can ask the lights to do. */
export interface StageRig {
  /** The house comes back up after a cut. On a work view the dark lamps warm one at a time. */
  strike: (stagger?: number) => void;
  /** Every lamp snaps dark, just ahead of the blackout, and the run's lamps are forgotten. */
  cut: () => void;
  /**
   * Lights the lamp for one finished step, counting from the left of the truss. Past the last
   * lamp it starts again from the left and burns those brighter.
   */
  pulse: (index: number) => void;
  /** While a run is going the key lamp sweeps slowly. Starting a search clears the last run. */
  search: (on: boolean) => void;
  /** A run came back with a result: every lit lamp rises into a wash. */
  wash: () => void;
  /** Kept for callers. The key lamp stays on the mic, so this does nothing. */
  aim: (clientX: number, clientY: number) => void;
}

// Gear is filled a shade above the room and picked out by the edges a light would catch.
const BODY = "#0a0e16";
const DEEP = "#070a10";
const EDGE = "rgba(168,186,214,0.3)";
const FAINT = "rgba(168,186,214,0.16)";
const AMBER = "#ffb44a";

/** How long a lamp flares when it is struck, and one leg of the key lamp's sweep. */
const STRUCK_MS = 420;
const SWEEP_MS = 2400;
/** Below this width the page is one column and the scene is only the truss and a short throw. */
const WIDE = 1024;
/** How far the key lamp's pool reaches left of the mic, in stage units. The beam shares it. */
const POOL_LEFT = 30;
/** The air the stage keeps from the text column and the panel edge, in pixels. */
const CLEAR = 10;

/**
 * Where each dark lamp hangs along the truss, and how far it was swung when it was focused.
 * `small` marks the few that stay when the page is one column.
 */
const LAMPS: { at: string; tilt: number; small?: boolean }[] = [
  { at: "6%", tilt: 14 },
  { at: "15%", tilt: 9, small: true },
  { at: "26%", tilt: -6 },
  { at: "35%", tilt: 11 },
  { at: "45%", tilt: 5, small: true },
  { at: "65%", tilt: -8 },
  { at: "74%", tilt: 7, small: true },
  { at: "85%", tilt: -12 },
  { at: "94%", tilt: -15 },
];

/**
 * One par can on its yoke. The origin is the underside of the truss, where the clamp bites. Dark
 * lamps are placed along the truss drawing; the lit one is its own drawing on the centre line.
 */
function Lamp({
  at,
  tilt,
  lit,
  small,
  order = 0,
}: {
  at?: string;
  tilt: number;
  lit?: boolean;
  small?: boolean;
  order?: number;
}) {
  const place = lit ? { width: 1, height: 1 } : { x: at, y: 18 };
  const name = lit ? "scene-key" : small ? "scene-lamp scene-lamp-small" : "scene-lamp";
  return (
    <svg
      {...place}
      overflow="visible"
      className={name}
      data-level={lit ? undefined : "0"}
      style={{ "--i": order } as CSSProperties}
    >
      <g transform="scale(0.7)">
        <rect x="-3.5" y="-5" width="7" height="12" rx="1.5" fill={BODY} stroke={EDGE} strokeWidth="1" />
        <path d="M-15 31V13q0-5 5-5h20q5 0 5 5v18" fill="none" stroke={BODY} strokeWidth="4" />
        <path d="M-15 31V13q0-5 5-5h20q5 0 5 5v18" fill="none" stroke={FAINT} strokeWidth="1" />
        <g className={lit ? "scene-swing" : undefined}>
          <g transform={`rotate(${tilt} 0 28)`}>
            <path d="M-9 20q0-8 9-8t9 8v24h-18z" fill={BODY} />
            <path d="M-9 44V20q0-8 9-8" fill="none" stroke={EDGE} strokeWidth="1" />
            <rect
              x="-13"
              y="44"
              width="26"
              height="5"
              rx="1"
              fill={BODY}
              stroke={lit ? "rgba(255,180,74,0.7)" : EDGE}
              strokeWidth="1"
            />
            <ellipse cx="0" cy="49.5" rx="11.5" ry="3" fill={DEEP} stroke={FAINT} strokeWidth="1" />
            {lit ? (
              <g className="scene-light">
                <g className="scene-breathe">
                  <circle cx="0" cy="50" r="30" fill="url(#scene-flare)" />
                  <ellipse cx="0" cy="49.5" rx="11.5" ry="3" fill="#ffe7bd" />
                </g>
              </g>
            ) : (
              <g className="scene-glow">
                <circle className="scene-flare" cx="0" cy="50" r="24" fill="url(#scene-flare)" />
                <polygon points="-10,50 10,50 15,68 -15,68" fill="url(#scene-nub)" />
                <ellipse cx="0" cy="49.5" rx="11.5" ry="3" fill="#ffe7bd" />
              </g>
            )}
          </g>
        </g>
        <circle cx="-15" cy="29" r="2.2" fill={BODY} stroke={FAINT} strokeWidth="1" />
        <circle cx="15" cy="29" r="2.2" fill={BODY} stroke={FAINT} strokeWidth="1" />
      </g>
    </svg>
  );
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The room behind the page: an empty club stage seen from the back, before the show. A truss of
 * dark lamps runs under the header, the gear waits low on the stage, and one lamp is left on over
 * the mic. Decorative only. Everything is vector, laid out with CSS, with no frame loop.
 *
 * The scene is fitted to the page so nothing in it sits behind text. The key lamp, its beam and
 * the mic stand go in the gutter between the two columns, and the rest of the stage shows only in
 * the clear band under the right-hand panel. `view` is here so the fit runs again on each view.
 */
export function StageScene({ rigRef, view }: { rigRef: RefObject<StageRig | null>; view: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const floor = floorRef.current;
    const ground = groundRef.current;
    const main = document.getElementById("main");
    if (!scene || !floor || !ground || !main) return;
    let frame = 0;
    let measured = false;

    const set = (name: string, value: string) => scene.style.setProperty(name, value);

    /** One column: the lit lamp hangs at the right and throws as far as the first line under it. */
    function fitNarrow(top: number, unit: number, pad: number) {
      const lead = main!.querySelector(".grid > :first-child");
      const x = window.innerWidth - pad - 18;
      const lens = top + 53 * unit;
      let reach = 190;
      if (lead) {
        // Only the text itself counts, line by line, so the throw can use the ragged right edge.
        const walker = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
          range.selectNodeContents(walker.currentNode);
          for (const box of range.getClientRects()) {
            const boxTop = box.top + window.scrollY;
            if (box.width > 0 && box.right > x - 36 && boxTop + box.height > lens) {
              reach = Math.min(reach, boxTop - lens - 8);
            }
          }
        }
      }
      set("--scene-x", `${x}px`);
      set("--scene-reach", `${reach >= 44 ? reach : 0}px`);
      scene!.dataset.gear = "off";
    }

    /** Two columns: find the gutter and the clear band under the right-hand panel. */
    function fitWide(top: number, unit: number) {
      const lead = main!.querySelector(".grid > :first-child");
      const panel = main!.querySelector("[data-scene-panel]");
      if (!lead || !panel) return false;
      // The scene scrolls with the page, so it is fitted in page coordinates. The activity panel
      // is sticky, so it is only measured while the page is at the top.
      const sy = window.scrollY;
      if (view !== "input" && sy > 0 && measured) return true;
      measured = true;
      const left = lead.getBoundingClientRect().right;
      const rect = panel.getBoundingClientRect();
      const box = { left: rect.left, bottom: rect.bottom + sy };
      if (box.left - left < 24) return false;
      const height = window.innerHeight;
      const width = window.innerWidth;
      const x = (left + box.left) / 2;
      // The stage stands on the footer when the footer is within the first screen.
      const footTop = (document.querySelector("footer")?.getBoundingClientRect().top ?? height) + sy;
      const lift = Math.max(0, height - footTop);
      const band = Math.min(height, footTop) - box.bottom;
      const gear = band >= 100;
      const gutter = box.left - left;
      // With no band the mic stands alone in the gutter, sized so it keeps clear of both columns.
      const k =
        gear && view === "input"
          ? clamp((band + 26) / 165, 0.6, 1.25)
          : Math.min(clamp(height / 900, 0.8, 1.15), Math.max(0.45, (gutter / 2 - CLEAR) / 24));
      const drop = height - lift - top - 52 * unit - 35 * k;
      set("--scene-x", `${x}px`);
      set("--scene-lift", `${lift}px`);
      set("--scene-k", k.toFixed(3));
      set("--scene-throw", `${(drop * Math.tan((2.5 * Math.PI) / 180)).toFixed(1)}px`);
      scene!.dataset.gear = gear ? "on" : "off";
      // Everything on the floor is cut to the gutter plus the band, so it can never show through
      // the panel or run under the left-hand column.
      const a = left + 4;
      const b = box.left;
      const base = height - lift;
      const under = Math.min(base, box.bottom);
      floor!.style.clipPath = `polygon(${a}px 0, ${b}px 0, ${b}px ${under}px, ${width}px ${under}px, ${width}px ${base}px, ${a}px ${base}px)`;
      // The stage itself keeps a little air from both columns, so the mic never touches them.
      const c = left + CLEAR;
      const d = box.left - CLEAR;
      const below = Math.min(base, box.bottom + CLEAR);
      ground!.style.clipPath = `polygon(${c}px 0, ${d}px 0, ${d}px ${below}px, ${width}px ${below}px, ${width}px ${base}px, ${c}px ${base}px)`;
      // A dark lamp that would hang on top of the key lamp is taken down.
      for (const lamp of scene!.querySelectorAll<SVGElement>(".scene-lamp")) {
        const at = (parseFloat(lamp.getAttribute("x") ?? "0") / 100) * width;
        lamp.style.visibility = Math.abs(at - x) < 44 ? "hidden" : "";
      }
      return true;
    }

    function fit() {
      frame = 0;
      const pad = parseFloat(getComputedStyle(main!).paddingTop) || 56;
      // The truss and its lamps shrink with the space above the headline so they never reach it.
      const unit = clamp(pad / 56, 0.46, 1);
      const top = main!.offsetTop;
      set("--scene-top", `${top}px`);
      set("--scene-u", unit.toFixed(3));
      const wide = window.innerWidth >= WIDE && fitWide(top, unit);
      if (!wide) fitNarrow(top, unit, parseFloat(getComputedStyle(main!).paddingLeft) || 16);
      scene!.dataset.fit = wide ? "wide" : "narrow";
    }

    const queue = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    fit();
    const observer = new ResizeObserver(queue);
    observer.observe(document.body);
    observer.observe(main);
    const panel = main.querySelector("[data-scene-panel]");
    if (panel) observer.observe(panel);
    window.addEventListener("resize", queue);
    // Entrance animations move the panel, so the fit runs again when each one lands.
    document.addEventListener("animationend", queue);
    void document.fonts?.ready.then(queue);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", queue);
      document.removeEventListener("animationend", queue);
    };
  }, [view]);

  // The rig only flips attributes. CSS transitions do the rest, so a call that lands in the
  // middle of another simply retargets, and there is no frame loop.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const timers = new Set<number>();
    let sweep = 0;

    const all = () => Array.from(scene.querySelectorAll<SVGElement>(".scene-lamp"));
    /** The lamps on show at this size, left to right. */
    const hung = () => all().filter((lamp) => lamp.style.visibility !== "hidden" && getComputedStyle(lamp).display !== "none");

    function reset() {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      for (const lamp of all()) {
        lamp.dataset.level = "0";
        delete lamp.dataset.struck;
      }
      delete scene!.dataset.wash;
    }

    function settle() {
      window.clearInterval(sweep);
      sweep = 0;
      delete scene!.dataset.swing;
    }

    resetRef.current = reset;
    rigRef.current = {
      strike() {
        delete scene.dataset.cut;
      },
      cut() {
        scene.dataset.cut = "true";
        reset();
      },
      pulse(index) {
        const lamps = hung();
        if (lamps.length === 0 || index < 0) return;
        const lamp = lamps[index % lamps.length];
        lamp.dataset.level = index >= lamps.length ? "3" : "2";
        lamp.dataset.struck = "true";
        const id = window.setTimeout(() => {
          timers.delete(id);
          delete lamp.dataset.struck;
        }, STRUCK_MS);
        timers.add(id);
      },
      search(on) {
        settle();
        if (!on) return;
        reset();
        // With reduced motion the lamps still come on one by one, but nothing moves.
        if (prefersReducedMotion()) return;
        scene.dataset.swing = "a";
        sweep = window.setInterval(() => {
          scene.dataset.swing = scene.dataset.swing === "a" ? "b" : "a";
        }, SWEEP_MS);
      },
      wash() {
        scene.dataset.wash = "true";
      },
      aim() {},
    };
    return () => {
      settle();
      reset();
      resetRef.current = null;
      rigRef.current = null;
    };
  }, [rigRef]);

  // With reduced motion there is no blackout, so nothing cuts the rig between views.
  useEffect(() => {
    if (prefersReducedMotion() && view === "input") resetRef.current?.();
  }, [view]);

  return (
    <div ref={sceneRef} aria-hidden="true" className="scene" data-view={view === "input" ? "input" : "work"}>
      <svg className="scene-truss" height="80">
        <defs>
          <pattern id="scene-lace" width="24" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 16L12 2L24 16" fill="none" stroke={BODY} strokeWidth="3" />
            <path d="M0 16L12 2" fill="none" stroke={FAINT} strokeWidth="1" />
          </pattern>
          <radialGradient id="scene-flare">
            <stop offset="0" stopColor={AMBER} stopOpacity="0.55" />
            <stop offset="0.35" stopColor={AMBER} stopOpacity="0.16" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="scene-nub" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AMBER} stopOpacity="0.5" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="scene-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AMBER} stopOpacity="0.13" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="18" fill="url(#scene-lace)" />
        <rect x="0" y="0" width="100%" height="3.5" fill={BODY} />
        <rect x="0" y="0" width="100%" height="1" fill={EDGE} />
        <rect x="0" y="14.5" width="100%" height="3.5" fill={BODY} />
        <rect x="0" y="14.5" width="100%" height="1" fill={FAINT} />
        {/* The wash: warm air under the truss and a lit edge along its lower chord. */}
        <g className="scene-wash">
          <rect x="0" y="18" width="100%" height="36" fill="url(#scene-haze)" />
          <rect x="0" y="17" width="100%" height="1" fill={AMBER} opacity="0.5" />
        </g>
        {LAMPS.map((lamp, index) => (
          <Lamp key={lamp.at} {...lamp} order={index} />
        ))}
      </svg>

      <Lamp tilt={-5} lit />

      {/* One column only: a short throw that fades out above the first line of text under it. */}
      <svg className="scene-short scene-light" viewBox="0 0 60 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="scene-short-throw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AMBER} stopOpacity="0.34" />
            <stop offset="0.5" stopColor={AMBER} stopOpacity="0.1" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon className="scene-breathe" points="24,0 36,0 60,100 0,100" fill="url(#scene-short-throw)" />
      </svg>

      <div ref={floorRef} className="scene-floor">
        <svg className="scene-beam scene-light" viewBox="0 0 184 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="scene-throw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={AMBER} stopOpacity="0.3" />
              <stop offset="0.25" stopColor={AMBER} stopOpacity="0.13" />
              <stop offset="1" stopColor={AMBER} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <polygon
            className="scene-breathe"
            points={`${POOL_LEFT - 8},0 ${POOL_LEFT + 8},0 184,100 0,100`}
            fill="url(#scene-throw)"
          />
        </svg>

      </div>

      <div ref={groundRef} className="scene-floor">
        {/* The mic stands at x=100. The stage runs off to the right and fades out to the left. */}
        <svg className="scene-stage" viewBox="0 0 1300 276">
          <defs>
            <radialGradient id="scene-pool">
              <stop offset="0" stopColor={AMBER} stopOpacity="0.5" />
              <stop offset="0.7" stopColor={AMBER} stopOpacity="0.34" />
              <stop offset="0.93" stopColor={AMBER} stopOpacity="0.1" />
              <stop offset="1" stopColor={AMBER} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="scene-lip" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={AMBER} stopOpacity="0" />
              <stop offset="0.5" stopColor={AMBER} stopOpacity="0.75" />
              <stop offset="1" stopColor={AMBER} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="scene-dark" gradientUnits="userSpaceOnUse" x1="56" y1="0" x2="100" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#fff" stopOpacity="1" />
            </linearGradient>
            <mask id="scene-ground" maskUnits="userSpaceOnUse" x="0" y="200" width="1300" height="76">
              <rect x="0" y="200" width="1300" height="76" fill="url(#scene-dark)" />
            </mask>
          </defs>

          {/* Stage floor and its front edge. Left of the mic there is no light, so no stage. */}
          <g mask="url(#scene-ground)">
            <rect x="0" y="218" width="1300" height="44" fill={DEEP} />
            <rect x="0" y="262" width="1300" height="14" fill={BODY} />
            <rect x="0" y="262" width="1300" height="1" fill={FAINT} />
          </g>

          <g className="scene-gear">
            {/* Drum riser and kit, seen a little from the left so the shells have depth. */}
            <polygon points="196,222 452,222 442,214 206,214" fill={DEEP} />
            <rect x="196" y="222" width="256" height="18" fill={BODY} />
            <rect x="196" y="222" width="256" height="1" fill={EDGE} />
            <g stroke={BODY} strokeWidth="3" strokeLinecap="round" fill="none">
              {/* Hi-hat, crash and ride stands with their tripods. */}
              <path d="M222 214V150M222 204L211 216M222 204L233 216" />
              <path d="M280 214V104L268 99M280 202L270 216M280 202L291 216" />
              <path d="M398 170V118M398 204L387 216M398 204L410 216" />
              {/* Snare stand, tom post, floor tom legs, kick spurs. */}
              <path d="M256 188V206L245 216M256 206L267 216" />
              <path d="M326 150V124" />
              <path d="M386 196L381 216M426 196L431 216M406 204V216" />
              <path d="M296 204L284 216M356 204L368 216" />
            </g>
            <g stroke={FAINT} strokeWidth="1" fill="none">
              <path d="M221 214V150M279 214V104M397 170V118" />
            </g>
            {/* Kick: shell first, then the front head. */}
            <path d="M320 146h16a26 36 0 0 1 0 72h-16z" fill={BODY} />
            <path d="M336 146a26 36 0 0 1 22 18" fill="none" stroke={FAINT} strokeWidth="1" />
            <ellipse cx="320" cy="182" rx="34" ry="36" fill={BODY} />
            <path d="M286.6 175A34 36 0 0 1 346 158.8" fill="none" stroke={EDGE} strokeWidth="1" />
            {/* Rack toms, one a size up from the other. */}
            <g transform="rotate(-10 300 131)">
              <rect x="282" y="119" width="36" height="24" rx="3" fill={BODY} />
              <path d="M282 140V122q0-3 3-3h30" fill="none" stroke={EDGE} strokeWidth="1" />
            </g>
            <g transform="rotate(9 350 132)">
              <rect x="329" y="118" width="42" height="28" rx="3" fill={BODY} />
              <path d="M329 143V121q0-3 3-3h36" fill="none" stroke={EDGE} strokeWidth="1" />
            </g>
            {/* Floor tom and snare. */}
            <rect x="382" y="160" width="48" height="42" rx="3" fill={BODY} />
            <path d="M382 199V163q0-3 3-3h42" fill="none" stroke={EDGE} strokeWidth="1" />
            <rect x="236" y="174" width="40" height="14" rx="2" fill={BODY} />
            <path d="M236 186V176q0-2 2-2h36" fill="none" stroke={EDGE} strokeWidth="1" />
            {/* Hats, crash, ride. */}
            <path d="M200 156q22 -7 44 0q-22 4 -44 0z" fill={BODY} />
            <path d="M200 156q22 -7 44 0" fill="none" stroke={EDGE} strokeWidth="1" />
            <path d="M201 159q21 4 42 0" fill="none" stroke={FAINT} strokeWidth="1" />
            <g transform="rotate(-10 266 99)">
              <path d="M234 99q32 -9 64 0q-32 4 -64 0z" fill={BODY} />
              <path d="M234 99q32 -9 64 0" fill="none" stroke={EDGE} strokeWidth="1" />
            </g>
            <g transform="rotate(8 400 116)">
              <path d="M365 116q35 -10 70 0q-35 4 -70 0z" fill={BODY} />
              <path d="M365 116q35 -10 70 0" fill="none" stroke={EDGE} strokeWidth="1" />
            </g>

            {/* A wedge, a half stack, a combo and a bass rig further along. */}
            <polygon points="478,258 548,258 541,236 485,236" fill={BODY} />
            <path d="M485 236H541" stroke={EDGE} strokeWidth="1" />
            <rect x="580" y="150" width="82" height="90" rx="2" fill={BODY} />
            <path d="M580 240V152q0-2 2-2h78" fill="none" stroke={EDGE} strokeWidth="1" />
            <rect x="584" y="124" width="74" height="26" rx="2" fill={BODY} />
            <path d="M584 150V126q0-2 2-2h70" fill="none" stroke={EDGE} strokeWidth="1" />
            <rect x="716" y="186" width="68" height="58" rx="2" fill={BODY} />
            <path d="M716 244V188q0-2 2-2h64" fill="none" stroke={EDGE} strokeWidth="1" />
            <path d="M720 199H780" stroke={FAINT} strokeWidth="1" />
            <rect x="850" y="128" width="76" height="112" rx="2" fill={BODY} />
            <path d="M850 240V130q0-2 2-2h72" fill="none" stroke={EDGE} strokeWidth="1" />
            <rect x="856" y="106" width="64" height="22" rx="2" fill={BODY} />
            <path d="M856 128V108q0-2 2-2h60" fill="none" stroke={EDGE} strokeWidth="1" />
          </g>

          {/* In the wash the whole stage comes up and the tops of the gear catch it. */}
          <g className="scene-wash scene-gear" fill="none" stroke={AMBER} strokeWidth="1">
            <ellipse cx="560" cy="244" rx="460" ry="16" fill={AMBER} stroke="none" opacity="0.1" />
            <g opacity="0.6">
              <path d="M196 222.5H452M200 156q22 -7 44 0M238 174H274M385 160H427" />
              <path d="M286.6 175A34 36 0 0 1 346 158.8" />
              <path d="M234 99q32 -9 64 0" transform="rotate(-10 266 99)" />
              <path d="M365 116q35 -10 70 0" transform="rotate(8 400 116)" />
              <path d="M285 119h30" transform="rotate(-10 300 131)" />
              <path d="M332 118h36" transform="rotate(9 350 132)" />
              <path d="M485 236H541M586 124h70M718 186h64M858 106h60" />
            </g>
          </g>

          {/* The pool the one lit lamp throws. It is aimed off the mic, toward the kit. */}
          {/* Alone in the gutter, the lamp throws a small pool right round the mic stand. */}
          <g className="scene-solo scene-light scene-pool">
            <g className="scene-breathe">
              <ellipse cx="100" cy="246" rx="30" ry="9" fill="url(#scene-pool)" />
            </g>
          </g>

          <g className="scene-gear scene-light scene-pool">
            <g className="scene-breathe">
              <ellipse cx="172" cy="241" rx="88" ry="15" fill="url(#scene-pool)" />
              <rect x="84" y="262" width="160" height="1.5" fill="url(#scene-lip)" />
            </g>
          </g>

          {/* What stands in the pool: the mic cable, the singer's wedge and the mic stand. */}
          <g className="scene-gear">
            <path d="M112 251C150 262 190 250 240 256S400 262 470 250" fill="none" stroke="#04060a" strokeWidth="2" />
            <polygon points="128,260 196,260 189,239 135,239" fill={BODY} />
            <path d="M135 239H189" stroke={EDGE} strokeWidth="1" />
          </g>
          <ellipse cx="100" cy="250" rx="15" ry="3.5" fill={BODY} stroke={EDGE} strokeWidth="1" />
          <path d="M100 250V114" stroke={BODY} strokeWidth="3.5" />
          <path d="M99 250V114" stroke={EDGE} strokeWidth="1" />
          <rect x="97" y="176" width="6" height="12" rx="1" fill={BODY} stroke={EDGE} strokeWidth="1" />
          <g transform="rotate(-28 100 114)">
            <rect x="96.5" y="96" width="7" height="24" rx="2" fill={BODY} stroke={EDGE} strokeWidth="1" />
            <circle cx="100" cy="92" r="6" fill={BODY} stroke={EDGE} strokeWidth="1" />
          </g>
          <g className="scene-light" fill="none" stroke={AMBER} strokeLinecap="round">
            <path d="M86 249.5Q100 246.5 114 249.5" strokeWidth="1" opacity="0.8" />
            <path d="M101.5 246V190M101.5 174V118" strokeWidth="1" opacity="0.45" />
            <path d="M84.5 91.6A6 6 0 0 1 94.9 91.6" strokeWidth="1.2" opacity="0.9" />
            <path className="scene-gear" d="M135 239H189" strokeWidth="1" opacity="0.7" />
            {/* The near side of the kit catches the spill. */}
            <g className="scene-gear" strokeWidth="1" opacity="0.45">
              <path d="M200 156q22 -7 44 0" />
              <path d="M238 174H274" />
              <path d="M286.6 175A34 36 0 0 1 300 153" />
              <path d="M196 222.5H300" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
