import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        serenita: {
          cream: "#F7F3EE",
          warm: "#EDE8E0",
          gold: "#8B6F47",
          "gold-light": "#C4944A",
          slate: "#2C3E50",
          "slate-light": "#5B7F95",
          green: "#5B8C5A",
          red: "#B85C5C",
          muted: "#8E8E8E",
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', "serif"],
        sans: ['"DM Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
