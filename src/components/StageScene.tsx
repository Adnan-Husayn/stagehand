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

// Gear is filled a shade above the room and picked out by the edges a light would catch.
const BODY = "#0a0e16";
const DEEP = "#070a10";
const EDGE = "rgba(168,186,214,0.3)";
const FAINT = "rgba(168,186,214,0.16)";
const AMBER = "#ffb44a";

/** Where each dark lamp hangs along the truss, and how far it was swung when it was focused. */
const LAMPS: { at: string; tilt: number }[] = [
  { at: "6%", tilt: 14 },
  { at: "15%", tilt: 9 },
  { at: "26%", tilt: -6 },
  { at: "35%", tilt: 11 },
  { at: "45%", tilt: 5 },
  { at: "65%", tilt: -8 },
  { at: "74%", tilt: 7 },
  { at: "85%", tilt: -12 },
  { at: "94%", tilt: -15 },
];

/**
 * One par can on its yoke. The origin is the underside of the truss, where the clamp bites. Dark
 * lamps are placed along the truss drawing; the lit one is its own drawing on the centre line.
 */
function Lamp({ at, tilt, lit }: { at?: string; tilt: number; lit?: boolean }) {
  const place = lit ? { width: 1, height: 1 } : { x: at, y: 24 };
  return (
    <svg {...place} overflow="visible" className={lit ? "scene-lamp scene-key" : "scene-lamp"}>
      <g transform="scale(0.8)">
      <rect x="-3.5" y="-5" width="7" height="12" rx="1.5" fill={BODY} stroke={EDGE} strokeWidth="1" />
      <path d="M-15 31V13q0-5 5-5h20q5 0 5 5v18" fill="none" stroke={BODY} strokeWidth="4" />
      <path d="M-15 31V13q0-5 5-5h20q5 0 5 5v18" fill="none" stroke={FAINT} strokeWidth="1" />
      <g transform={`rotate(${tilt} 0 28)`}>
        <path d="M-9 20q0-8 9-8t9 8v24h-18z" fill={BODY} />
        <path d="M-9 44V20q0-8 9-8" fill="none" stroke={EDGE} strokeWidth="1" />
        <rect x="-13" y="44" width="26" height="5" rx="1" fill={BODY} stroke={lit ? "rgba(255,180,74,0.7)" : EDGE} strokeWidth="1" />
        <ellipse cx="0" cy="49.5" rx="11.5" ry="3" fill={DEEP} stroke={FAINT} strokeWidth="1" />
        {lit && (
          <g className="scene-light">
            <defs>
              <radialGradient id="scene-flare">
                <stop offset="0" stopColor={AMBER} stopOpacity="0.55" />
                <stop offset="0.35" stopColor={AMBER} stopOpacity="0.16" />
                <stop offset="1" stopColor={AMBER} stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="scene-breathe">
              <circle cx="0" cy="50" r="30" fill="url(#scene-flare)" />
              <ellipse cx="0" cy="49.5" rx="11.5" ry="3" fill="#ffe7bd" />
            </g>
          </g>
        )}
      </g>
      <circle cx="-15" cy="29" r="2.2" fill={BODY} stroke={FAINT} strokeWidth="1" />
      <circle cx="15" cy="29" r="2.2" fill={BODY} stroke={FAINT} strokeWidth="1" />
      </g>
    </svg>
  );
}

/**
 * The room behind the page: an empty club stage seen from the back, before the show. A truss of
 * dark lamps runs under the header, the gear waits low on the stage, and one lamp is left on over
 * the mic. Decorative only. Everything is vector, laid out with CSS, with no frame loop.
 *
 * `quiet` turns the beam down for the views where the headline runs across the middle of the page.
 */
export function StageScene({ rigRef, quiet = false }: { rigRef: RefObject<StageRig | null>; quiet?: boolean }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  // The truss hangs just under whatever sits above the page content (header, demo banner).
  useEffect(() => {
    const scene = sceneRef.current;
    const main = document.getElementById("main");
    if (!scene || !main) return;
    const place = () => scene.style.setProperty("--scene-top", `${main.offsetTop + 2}px`);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(document.body);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // The lamps are wired to these calls in the next step. For now the scene is one still state
    // and the blackout between views is the overlay that sits above it.
    rigRef.current = {
      strike() {},
      cut() {},
      pulse() {},
      search() {},
      aim() {},
    };
    return () => {
      rigRef.current = null;
    };
  }, [rigRef]);

  return (
    <div ref={sceneRef} aria-hidden="true" className="scene" data-quiet={quiet}>
      <svg className="scene-truss" width="100%" height="120">
        <defs>
          <pattern id="scene-lace" width="30" height="24" patternUnits="userSpaceOnUse">
            <path d="M0 21L15 3L30 21" fill="none" stroke={BODY} strokeWidth="3" />
            <path d="M0 21L15 3" fill="none" stroke={FAINT} strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="24" fill="url(#scene-lace)" />
        <rect x="0" y="0" width="100%" height="4" fill={BODY} />
        <rect x="0" y="0" width="100%" height="1" fill={EDGE} />
        <rect x="0" y="20" width="100%" height="4" fill={BODY} />
        <rect x="0" y="20" width="100%" height="1" fill={FAINT} />
        {LAMPS.map((lamp) => (
          <Lamp key={lamp.at} {...lamp} />
        ))}
      </svg>

      <Lamp tilt={-5} lit />

      <svg className="scene-beam scene-light" viewBox="0 0 224 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="scene-throw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AMBER} stopOpacity="0.3" />
            <stop offset="0.25" stopColor={AMBER} stopOpacity="0.13" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon className="scene-breathe" points="65,0 87,0 224,100 0,100" fill="url(#scene-throw)" />
      </svg>

      <svg className="scene-stage" viewBox="0 0 1600 330">
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
        </defs>

        {/* Stage floor and the front of the stage. */}
        <polygon points="150,262 1450,262 1424,218 176,218" fill={DEEP} />
        <rect x="150" y="262" width="1300" height="68" fill={BODY} />
        <rect x="150" y="262" width="1300" height="1" fill={FAINT} />

        {/* Bass rig and a combo, house left. */}
        <rect x="380" y="184" width="70" height="58" rx="2" fill={BODY} />
        <path d="M380 242V186q0-2 2-2h66" fill="none" stroke={EDGE} strokeWidth="1" />
        <path d="M384 197H446" stroke={FAINT} strokeWidth="1" />
        <rect x="520" y="128" width="76" height="112" rx="2" fill={BODY} />
        <path d="M520 240V130q0-2 2-2h72" fill="none" stroke={EDGE} strokeWidth="1" />
        <rect x="526" y="106" width="64" height="22" rx="2" fill={BODY} />
        <path d="M526 128V108q0-2 2-2h60" fill="none" stroke={EDGE} strokeWidth="1" />

        {/* Drum riser and kit. */}
        <polygon points="890,222 1130,222 1120,214 900,214" fill={DEEP} />
        <rect x="890" y="222" width="240" height="18" fill={BODY} />
        <rect x="890" y="222" width="240" height="1" fill={EDGE} />
        <g stroke={BODY} strokeWidth="3" fill="none">
          <path d="M912 218V152M958 160V104M1078 164V116M948 189V218M1070 200V218M1102 200V218" />
        </g>
        <g stroke={FAINT} strokeWidth="1" fill="none">
          <path d="M911 218V152M957 160V104M1077 164V116" />
        </g>
        <circle cx="1010" cy="180" r="38" fill={BODY} />
        <path d="M972.4 174.5A38 38 0 0 1 1042.5 160.3" fill="none" stroke={EDGE} strokeWidth="1" />
        <circle cx="1010" cy="180" r="32" fill="none" stroke={FAINT} strokeWidth="1" />
        <g transform="rotate(-7 986 128)">
          <rect x="966" y="115" width="40" height="27" rx="3" fill={BODY} />
          <path d="M966 139V118q0-3 3-3h34" fill="none" stroke={EDGE} strokeWidth="1" />
        </g>
        <g transform="rotate(7 1034 128)">
          <rect x="1014" y="115" width="40" height="27" rx="3" fill={BODY} />
          <path d="M1014 139V118q0-3 3-3h34" fill="none" stroke={EDGE} strokeWidth="1" />
        </g>
        <rect x="1064" y="160" width="44" height="40" rx="3" fill={BODY} />
        <path d="M1064 197V163q0-3 3-3h38" fill="none" stroke={EDGE} strokeWidth="1" />
        <rect x="928" y="176" width="40" height="13" rx="2" fill={BODY} />
        <path d="M928 187V178q0-2 2-2h36" fill="none" stroke={EDGE} strokeWidth="1" />
        <ellipse cx="912" cy="159" rx="22" ry="2.5" fill={BODY} />
        <path d="M890 159A22 2.5 0 0 1 934 159" fill="none" stroke={EDGE} strokeWidth="1" />
        <g transform="rotate(-9 952 101)">
          <ellipse cx="952" cy="101" rx="32" ry="3.5" fill={BODY} />
          <path d="M920 101A32 3.5 0 0 1 984 101" fill="none" stroke={EDGE} strokeWidth="1" />
        </g>
        <g transform="rotate(8 1084 113)">
          <ellipse cx="1084" cy="113" rx="34" ry="3.5" fill={BODY} />
          <path d="M1050 113A34 3.5 0 0 1 1118 113" fill="none" stroke={EDGE} strokeWidth="1" />
        </g>

        {/* Half stack and a combo, house right. */}
        <rect x="1230" y="150" width="82" height="90" rx="2" fill={BODY} />
        <path d="M1230 240V152q0-2 2-2h78" fill="none" stroke={EDGE} strokeWidth="1" />
        <rect x="1234" y="124" width="74" height="26" rx="2" fill={BODY} />
        <path d="M1234 150V126q0-2 2-2h70" fill="none" stroke={EDGE} strokeWidth="1" />
        <rect x="1370" y="186" width="68" height="58" rx="2" fill={BODY} />
        <path d="M1370 244V188q0-2 2-2h64" fill="none" stroke={EDGE} strokeWidth="1" />
        <path d="M1374 199H1434" stroke={FAINT} strokeWidth="1" />

        {/* The pool the one lit lamp throws. It is aimed a little off the mic, toward the kit. */}
        <g className="scene-light">
          <g className="scene-breathe">
            <ellipse cx="836" cy="241" rx="112" ry="17" fill="url(#scene-pool)" />
            <rect x="740" y="262" width="192" height="1.5" fill="url(#scene-lip)" />
          </g>
        </g>

        {/* Mic cable, monitor wedges and the mic stand. */}
        <path d="M812 251C850 262 890 250 930 256S1060 262 1140 250" fill="none" stroke="#04060a" strokeWidth="2" />
        <polygon points="694,260 764,260 757,238 701,238" fill={BODY} />
        <path d="M701 238H757" stroke={EDGE} strokeWidth="1" />
        <polygon points="1150,258 1220,258 1213,236 1157,236" fill={BODY} />
        <path d="M1157 236H1213" stroke={EDGE} strokeWidth="1" />
        <polygon points="560,258 630,258 623,236 567,236" fill={BODY} />
        <path d="M567 236H623" stroke={EDGE} strokeWidth="1" />
        <ellipse cx="800" cy="250" rx="15" ry="3.5" fill={BODY} stroke={EDGE} strokeWidth="1" />
        <path d="M800 250V114" stroke={BODY} strokeWidth="3.5" />
        <path d="M799 250V114" stroke={EDGE} strokeWidth="1" />
        <rect x="797" y="176" width="6" height="12" rx="1" fill={BODY} stroke={EDGE} strokeWidth="1" />
        <g transform="rotate(-28 800 114)">
          <rect x="796.5" y="96" width="7" height="24" rx="2" fill={BODY} stroke={EDGE} strokeWidth="1" />
          <circle cx="800" cy="92" r="6" fill={BODY} stroke={EDGE} strokeWidth="1" />
        </g>
        <g className="scene-light" fill="none" stroke={AMBER} strokeLinecap="round">
          <path d="M786 249.5Q800 246.5 814 249.5" strokeWidth="1" opacity="0.8" />
          <path d="M801.5 246V190M801.5 174V118" strokeWidth="1" opacity="0.45" />
          <path d="M784.5 91.6A6 6 0 0 1 794.9 91.6" strokeWidth="1.2" opacity="0.9" />
          <path d="M722 238H757" strokeWidth="1" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
