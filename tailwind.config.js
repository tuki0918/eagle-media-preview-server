/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./plugin/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--bg)",
          surface: "var(--surface)",
          "surface-strong": "var(--surface-strong)",
          "surface-soft": "var(--surface-soft)",
          text: "var(--text)",
          "text-soft": "var(--text-soft)",
          muted: "var(--muted)",
          "muted-soft": "var(--muted-soft)",
          border: "var(--border)",
          "border-strong": "var(--border-strong)",
          accent: "var(--accent)",
          "accent-strong": "var(--accent-strong)",
          "accent-soft": "var(--accent-soft)",
          warn: "var(--warn)",
          success: "var(--success)",
          danger: "var(--danger)",
          nav: "var(--nav)",
        },
      },
      boxShadow: {
        app: "var(--shadow)",
        "app-soft": "var(--shadow-soft)",
      },
      borderRadius: {
        app: "8px",
      },
    },
  },
  plugins: [],
};
