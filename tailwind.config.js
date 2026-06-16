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
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
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
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        app: {
          bg: "var(--app-bg)",
          surface: "var(--app-surface)",
          "surface-strong": "var(--app-surface-strong)",
          "surface-soft": "var(--app-surface-soft)",
          text: "var(--app-text)",
          "text-soft": "var(--app-text-soft)",
          muted: "var(--app-muted)",
          "muted-soft": "var(--app-muted-soft)",
          border: "var(--border)",
          "border-strong": "var(--app-border-strong)",
          accent: "var(--primary)",
          "accent-strong": "var(--app-accent-strong)",
          "accent-soft": "var(--app-accent-soft)",
          warn: "var(--app-warn)",
          success: "var(--app-success)",
          danger: "var(--app-danger)",
          nav: "var(--app-nav)",
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
