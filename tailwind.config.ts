import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // One type scale for the whole app. Line height comes from the body (1.55).
    fontSize: {
      "2xs": "0.6875rem", // 11
      xs: "0.75rem", // 12
      sm: "0.8125rem", // 13
      ui: "0.875rem", // 14
      base: "0.9375rem", // 15
      body: "1rem", // 16, also keeps iOS from zooming on focus
      md: "1.0625rem", // 17
      lead: "clamp(1.05rem, 1.3vw, 1.2rem)",
    },
    extend: {
      colors: {
        // The room, the panels that sit in it and the raised surfaces on those.
        room: "#05070c",
        panel: "#0b0f17",
        raised: "#131a27",
        well: "#070a10",
        // Text: primary, text set straight on the canvas, secondary, placeholder.
        ink: "#f1f4fa",
        lit: "#dfe5f0",
        soft: "#b3bdcf",
        dim: "#8f9bb1",
        // The follow spot colour, its dark text and the warm italic.
        key: {
          DEFAULT: "#ffb44a",
          ink: "#1b1204",
        },
        warm: "#ffd08c",
        // Qloo tags and hover borders.
        beam: "#a9ccff",
        // Errors only.
        stop: "#ff9485",
        // Input borders and dashed rules at rest.
        field: "#6d7b95",
        hair: "rgba(169, 204, 255, 0.16)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Didot", '"Bodoni 72"', "Georgia", "serif"],
        sans: ["var(--font-sans)", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      spacing: {
        pad: "var(--pad)",
      },
      maxWidth: {
        shell: "92rem",
      },
      transitionTimingFunction: {
        stage: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      // The keyframes live in globals.css.
      animation: {
        dot: "dot-pulse 1.1s ease-in-out infinite",
        wait: "wait 1.6s ease-in-out infinite",
        chip: "chip 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
