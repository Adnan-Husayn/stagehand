import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // One type scale for the whole app. Sizes are px values written in rem.
    fontSize: {
      "2xs": ["0.6875rem", "1rem"], // 11
      xs: ["0.75rem", "1.125rem"], // 12
      sm: ["0.8125rem", "1.25rem"], // 13
      base: ["0.9375rem", "1.5rem"], // 15
      input: ["1rem", "1.5rem"], // 16, keeps iOS from zooming on focus
      md: ["1.0625rem", "1.625rem"], // 17
      lg: ["1.25rem", "1.5rem"], // 20
      xl: ["1.75rem", "1.1"], // 28
      "2xl": ["2.25rem", "1.06"], // 36
      "3xl": ["2.75rem", "1.04"], // 44
      "4xl": ["3.5rem", "1"], // 56
    },
    extend: {
      colors: {
        paper: "#ffffff",
        wash: "#f4f4f4",
        // Text and strong rules. 2 is secondary text, 3 is meta.
        ink: {
          DEFAULT: "#111111",
          2: "#555555",
          3: "#6e6e6e",
        },
        // Hairlines between rows.
        rule: "#d6d6d6",
        // Input borders at rest.
        field: "#8a8a8a",
        // The one accent. Fill only, always under ink text: the main action, live state
        // and the placeholders a booker has to replace.
        mark: "#ffe600",
        // Errors only.
        stop: "#b3261e",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Franklin Gothic Medium", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        shell: "80rem",
      },
      borderRadius: {
        DEFAULT: "2px",
      },
      keyframes: {
        "view-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "row-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 55%": { opacity: "1" },
          "56%, 100%": { opacity: "0.15" },
        },
        wait: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "view-in": "view-in 160ms ease-out both",
        "row-in": "row-in 220ms ease-out both",
        blink: "blink 1s linear infinite",
        wait: "wait 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
