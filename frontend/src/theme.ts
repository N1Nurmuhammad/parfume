import { createTheme } from "@mantine/core";

// Warm rose/amber accent to match the "Amore Here Sulwhasoo" boutique brand.
export const theme = createTheme({
  primaryColor: "amore",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  headings: {
    fontWeight: "700",
  },
  colors: {
    amore: [
      "#fdf2f4",
      "#f7dde2",
      "#eeb9c3",
      "#e592a3",
      "#dd7186",
      "#d85c74",
      "#d6516b",
      "#bd4159",
      "#a9384e",
      "#952d43",
    ],
  },
});
