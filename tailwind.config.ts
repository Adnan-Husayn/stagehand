import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0d12",
          900: "#12151d",
          800: "#1b1f2a",
          700: "#262c3a",
          500: "#6b7385",
          300: "#a9b0c0",
          100: "#e6e9f0",
        },
        ember: {
          500: "#f0643c",
          400: "#f5835f",
        },
        tide: {
          500: "#2fb8a6",
          400: "#55cdbd",
        },
        gold: {
          400: "#e8b84a",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
