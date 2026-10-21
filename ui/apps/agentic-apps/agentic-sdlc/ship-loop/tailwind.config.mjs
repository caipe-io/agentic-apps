export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "ship-loop-halo-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.85" },
        },
        "ship-loop-dash": {
          from: { strokeDashoffset: "0" },
          to: { strokeDashoffset: "-32" },
        },
      },
      animation: {
        "ship-loop-halo-soft": "ship-loop-halo-soft 4s ease-in-out infinite",
        "ship-loop-dash": "ship-loop-dash 12s linear infinite",
      },
      colors: Object.fromEntries(
        [
          "background",
          "foreground",
          "border",
          "input",
          "ring",
          "primary",
          "secondary",
          "muted",
          "accent",
          "destructive",
          "card",
          "popover",
        ].map((k) => [
          k,
          {
            DEFAULT: `hsl(var(--${k}))`,
            foreground: `hsl(var(--${k}-foreground))`,
          },
        ]),
      ),
    },
  },
  plugins: [],
};
