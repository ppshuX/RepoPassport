/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0d1117",
          panel: "#161b22",
          border: "#30363d",
          text: "#c9d1d9",
          dim: "#8b949e",
          green: "#3fb950",
          red: "#f85149",
          blue: "#58a6ff",
          yellow: "#d2991d",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
