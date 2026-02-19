/**
 * Design Tokens - Linear.app Dark Theme
 * Source: docs/design-system/linear-theme.json
 */

export const colors = {
  brand: {
    white: "#fff",
    black: "#000",
    blue: "#4ea7fc",
    red: "#eb5757",
    green: "#27a644",
    orange: "#fc7840",
    yellow: "#f0bf00",
    indigo: "#5e6ad2",
    teal: "#00b8cc",
    accent: "#7170ff",
    accentHover: "#828fff",
    accentTint: "#18182f",
  },

  bg: {
    primary: "#08090a",
    secondary: "#1c1c1f",
    tertiary: "#232326",
    quaternary: "#28282c",
    panel: "#0f1011",
    level0: "#08090a",
    level1: "#0f1011",
    level2: "#141516",
    level3: "#191a1b",
    tint: "#141516",
    translucent: "#ffffff0d",
  },

  fg: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },

  border: {
    primary: "#23252a",
    secondary: "#34343a",
    tertiary: "#3e3e44",
    translucent: "#ffffff0d",
  },

  link: {
    primary: "#828fff",
    hover: "#fff",
  },

  overlay: {
    primary: "#000000d9",
  },

  header: {
    background: "#0b0b0bcc",
    border: "#ffffff14",
  },

  scrollbar: {
    default: "#ffffff1a",
    hover: "#fff3",
    active: "#fff6",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: [
      '"Pretendard Variable"',
      "Pretendard",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "sans-serif",
    ].join(", "),
    mono: [
      '"Berkeley Mono"',
      "ui-monospace",
      '"SF Mono"',
      "Menlo",
      "monospace",
    ].join(", "),
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 510,
    semibold: 590,
    bold: 680,
  },

  fontSize: {
    micro: "0.6875rem",
    mini: "0.75rem",
    small: "0.8125rem",
    regular: "0.9375rem",
    large: "1.125rem",
    title3: "1.25rem",
    title2: "1.5rem",
    title1: "2.25rem",
  },
} as const;

export const radius = {
  4: "4px",
  6: "6px",
  8: "8px",
  12: "12px",
  16: "16px",
  24: "24px",
  rounded: "9999px",
} as const;

export const shadows = {
  none: "none",
  low: "0px 2px 4px #0000001a",
  medium: "0px 4px 24px #0003",
  high: "0px 7px 32px #00000059",
} as const;

export const spacing = {
  headerHeight: 56,
  sidebarWidth: 220,
  sidebarCollapsedWidth: 56,
  pageInset: 32,
} as const;

export const animation = {
  quick: "0.1s",
  regular: "0.25s",
  easing: {
    outCubic: "cubic-bezier(0.215, 0.61, 0.355, 1)",
    outQuart: "cubic-bezier(0.165, 0.84, 0.44, 1)",
    inOutCubic: "cubic-bezier(0.645, 0.045, 0.355, 1)",
  },
} as const;

export const focusRing = {
  color: "#5e6ad2",
  width: "2px",
  offset: "2px",
} as const;
