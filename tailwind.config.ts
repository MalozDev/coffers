import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/*
 * Tailwind v3 port of the `@custom-variant data-*` rules that ship in
 * node_modules/shadcn/tailwind.css. That file is Tailwind v4 syntax, which v3
 * ignores completely — without these, classes like `data-active:bg-background`
 * (active tabs), `data-open:animate-in` (menus/dialogs) and
 * `data-horizontal:h-px` (separators) silently never generate.
 *
 * NOTE: Tailwind v3 drops comma-separated TOP-LEVEL selectors in variant
 * definitions (splitAtTopLevelOnly), so every alternative must live INSIDE an
 * `:is(...)` — commas within :is() are not top-level and survive. The
 * selectors cover both Radix-style `data-state="*"` and Base UI-style
 * `data-*` / aria markers (Base UI tabs render `data-active=""` + 
 * `aria-selected="true"`, NOT data-state).
 */
const dataVariants = plugin(({ addVariant }) => {
  addVariant(
    "data-open",
    '&:is([data-state="open"], [data-open]:not([data-open="false"]), [aria-expanded="true"])'
  );
  addVariant(
    "data-closed",
    '&:is([data-state="closed"], [data-closed]:not([data-closed="false"]), [aria-expanded="false"])'
  );
  addVariant(
    "data-checked",
    '&:is([data-state="checked"], [data-checked]:not([data-checked="false"]), [aria-checked="true"])'
  );
  addVariant(
    "data-unchecked",
    '&:is([data-state="unchecked"], [data-unchecked]:not([data-unchecked="false"]), [aria-checked="false"])'
  );
  addVariant(
    "data-selected",
    '&:is([data-state="selected"], [data-selected="true"], [aria-selected="true"])'
  );
  addVariant(
    "data-disabled",
    '&:is([data-state="disabled"], [data-disabled]:not([data-disabled="false"]), [aria-disabled="true"])'
  );
  addVariant(
    "data-active",
    '&:is([data-state="active"], [data-active]:not([data-active="false"]), [aria-selected="true"])'
  );
  addVariant("data-inset", '&:is([data-inset]:not([data-inset="false"]))');
  addVariant(
    "data-popup-open",
    '&:is([data-popup-open]:not([data-popup-open="false"]), [data-state="open"])'
  );
  addVariant("data-horizontal", '&:is([data-orientation="horizontal"])');
  addVariant("data-vertical", '&:is([data-orientation="vertical"])');
});

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Coffers brand (for direct use) */
        brand: {
          primary: "#fbfff1",
          secondary: "#090c9b",
          accent: "#3066be",
          neutral: "#3c3744",
          "soft-blue": "#b4c5e4",
        },
        /*
         * shadcn CSS variable-based tokens.
         * The vars in app/globals.css hold bare oklch channels (e.g.
         * `0.99 0.002 100`), so they must be wrapped in `oklch(...)`.
         * The `<alpha-value>` placeholder is what makes opacity modifiers
         * like `bg-muted/50` compile to `oklch(var(--muted) / 0.5)`.
         * (Previously these were `hsl(var(--x))` around oklch values, which
         * is invalid CSS — every themed color computed to transparent.)
         */
        border: "oklch(var(--border) / <alpha-value>)",
        input: "oklch(var(--input) / <alpha-value>)",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background) / <alpha-value>)",
        foreground: "oklch(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "oklch(var(--popover) / <alpha-value>)",
          foreground: "oklch(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "oklch(var(--card) / <alpha-value>)",
          foreground: "oklch(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "oklch(var(--sidebar) / <alpha-value>)",
          foreground: "oklch(var(--sidebar-foreground) / <alpha-value>)",
          primary: "oklch(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground":
            "oklch(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "oklch(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground":
            "oklch(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "oklch(var(--sidebar-border) / <alpha-value>)",
          ring: "oklch(var(--sidebar-ring) / <alpha-value>)",
        },
        chart: {
          1: "oklch(var(--chart-1) / <alpha-value>)",
          2: "oklch(var(--chart-2) / <alpha-value>)",
          3: "oklch(var(--chart-3) / <alpha-value>)",
          4: "oklch(var(--chart-4) / <alpha-value>)",
          5: "oklch(var(--chart-5) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-raleway)",
          "Raleway",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
        soft: "0 2px 8px rgba(0,0,0,0.04)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-left": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-33.333%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-left": "slide-left 20s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), dataVariants],
};

export default config;
