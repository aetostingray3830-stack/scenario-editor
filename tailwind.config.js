import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans'", "sans-serif"], // ← 基本を Noto Sans に
      },
    },
  },
  plugins: [],
};

export default config;
