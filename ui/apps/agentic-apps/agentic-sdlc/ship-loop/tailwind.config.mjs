export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
