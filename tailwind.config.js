/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./plugin/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
        },
        muted: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent-soft)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
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
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "4xl": "2rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
