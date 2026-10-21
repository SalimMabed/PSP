import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Identity carried over from the source project ("Gestion d'argent" mockup)
        ivory: { DEFAULT: "#F7F4EF", dim: "#EDE9E1", line: "#E8E3DA", soft: "#EFEAE0" },
        ink: { DEFAULT: "#1E1C19", soft: "#46433E", muted: "#625F59" },
        teal: { DEFAULT: "#12574F", accent: "#00918B", light: "#E2F0EE", dark: "#0C3F39" },
        terracotta: { DEFAULT: "#B9552F", light: "#F8E6DE", dark: "#8F3E1F" },
        // Semantic status colors (text / background): contrast verified ≥ 4.5:1
        success: { DEFAULT: "#0B6B43", bg: "#E1F3EA", bar: "#1E9A68" },
        pending: { DEFAULT: "#7A4E00", bg: "#FBEFD0", bar: "#B7791F" },
        danger: { DEFAULT: "#A32F17", bg: "#FBE4DD", bar: "#C8472B" },
        refund: { DEFAULT: "#3A4799", bg: "#E6E9F8", bar: "#6574C9" },
        neutral: { DEFAULT: "#4B4842", bg: "#ECE8E0", bar: "#7D786E" },
      },
      fontFamily: {
        serif: ['"Literata Variable"', "Literata", "Georgia", "serif"],
        sans: ['"Schibsted Grotesk Variable"', '"Schibsted Grotesk"', "system-ui", "sans-serif"],
      },
      borderRadius: { card: "16px" },
      boxShadow: {
        card: "0 1px 2px rgba(30,28,25,0.04), 0 4px 16px rgba(30,28,25,0.04)",
        pop: "0 12px 40px rgba(30,28,25,0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
