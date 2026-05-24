import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Microsoft YaHei UI", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "SFMono-Regular", "Consolas", "monospace"],
      },
      colors: {
        ink: "#172033",
        muted: "#667085",
        line: "#E2E8F0",
        canvas: "#F7F8FA",
        panel: "#FFFFFF",
        accent: "#0F766E",
        amber: "#B45309",
        good: "#15803D",
        danger: "#B42318",
      },
      boxShadow: {
        quiet: "0 12px 32px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
