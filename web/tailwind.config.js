/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // 薄荷綠：庫存、確認、成功
        mint: {
          50: "#f0fdf7",
          100: "#d7fbe9",
          200: "#aff4d4",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
        // 活力橘：調撥、警示
        zest: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        // 天空藍：發放、操作
        sky2: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
      },
      boxShadow: {
        card: "0 6px 18px -8px rgba(15, 82, 87, 0.25)",
        pop: "0 16px 40px -12px rgba(15, 82, 87, 0.35)",
      },
      animation: {
        up: "up .25s ease-out both",
      },
      keyframes: {
        up: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
