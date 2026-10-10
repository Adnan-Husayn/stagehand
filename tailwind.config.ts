import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The room with the house lights down.
        stage: {
          950: "#0b0907",
          900: "#13100c",
          850: "#1a1611",
          800: "#231e17",
          700: "#332c22",
          600: "#4a4133",
        },
        // Text on the stage.
        bone: {
          100: "#f4ecdc",
          300: "#d3c9b4",
          400: "#aba28f",
          500: "#8f8776",
        },
        // Content surfaces.
        paper: {
          50: "#faf5ea",
          100: "#f1e8d6",
          200: "#e6dbc4",
          300: "#d3c5a8",
          400: "#b5a686",
        },
        // Text on paper.
        ink: {
          900: "#17130e",
          700: "#3a3329",
          500: "#5a5043",
          400: "#6b6051",
        },
        // The one hot accent. 400 is for small text on the stage, 600 for large numerals on paper,
        // 700 for small text on paper.
        signal: {
          DEFAULT: "#ee4231",
          400: "#ff6a55",
          600: "#d93523",
          700: "#b3261a",
        },
        // The cool secondary. Reserved for anything that comes from Qloo.
        tape: {
          300: "#8adbd0",
          400: "#5ec8ba",
          700: "#0d6259",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Stagehand Display Fallback", "Arial Narrow", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        shell: "82.5rem",
      },
      boxShadow: {
        sheet: "0 1px 0 rgba(255,255,255,0.35) inset, 0 30px 60px -30px rgba(0,0,0,0.9), 0 12px 24px -16px rgba(0,0,0,0.8)",
        press: "4px 4px 0 #17130e",
        "press-sm": "2px 2px 0 #17130e",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "view-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "step-in": {
          from: { opacity: "0", transform: "translateX(-6px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        meter: {
          "0%, 100%": { transform: "scaleY(0.2)" },
          "50%": { transform: "scaleY(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "180% 0" },
          to: { backgroundPosition: "-80% 0" },
        },
        stamp: {
          "0%": { opacity: "0", transform: "scale(1.35)" },
          "55%": { opacity: "1", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        draw: {
          from: { strokeDashoffset: "18" },
          to: { strokeDashoffset: "0" },
        },
        "live-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(94, 200, 186, 0.55)" },
          "100%": { boxShadow: "0 0 0 8px rgba(94, 200, 186, 0)" },
        },
      },
      animation: {
        rise: "rise 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "view-in": "view-in 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "step-in": "step-in 260ms ease-out both",
        meter: "meter 900ms ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        stamp: "stamp 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        draw: "draw 260ms 80ms ease-out both",
        "live-ring": "live-ring 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
