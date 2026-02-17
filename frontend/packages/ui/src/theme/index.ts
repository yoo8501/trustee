"use client";

import { createTheme } from "@mui/material/styles";
import { koKR } from "@mui/material/locale";
import { colors, typography, radius, shadows, focusRing } from "./tokens";

const theme = createTheme(
  {
    palette: {
      mode: "dark",
      primary: {
        main: colors.brand.indigo,
        light: colors.brand.accentHover,
        dark: colors.brand.accentTint,
      },
      secondary: {
        main: colors.fg.tertiary,
        light: colors.fg.secondary,
        dark: colors.fg.quaternary,
      },
      error: {
        main: colors.brand.red,
      },
      warning: {
        main: colors.brand.orange,
      },
      success: {
        main: colors.brand.green,
      },
      info: {
        main: colors.brand.blue,
      },
      background: {
        default: colors.bg.primary,
        paper: colors.bg.level1,
      },
      text: {
        primary: colors.fg.primary,
        secondary: colors.fg.secondary,
        disabled: colors.fg.quaternary,
      },
      divider: colors.border.primary,
      action: {
        hover: colors.bg.translucent,
        selected: colors.brand.accentTint,
        disabled: colors.fg.quaternary,
        disabledBackground: colors.bg.tertiary,
      },
    },
    typography: {
      fontFamily: typography.fontFamily.sans,
      fontSize: 14,
      fontWeightLight: typography.fontWeight.light,
      fontWeightRegular: typography.fontWeight.normal,
      fontWeightMedium: typography.fontWeight.medium,
      fontWeightBold: typography.fontWeight.bold,
      h1: {
        fontSize: typography.fontSize.title1,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.022em",
        lineHeight: 1.125,
      },
      h2: {
        fontSize: typography.fontSize.title2,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.012em",
        lineHeight: 1.33,
      },
      h3: {
        fontSize: typography.fontSize.title3,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.012em",
        lineHeight: 1.33,
      },
      h4: {
        fontSize: typography.fontSize.large,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.011em",
        lineHeight: 1.4,
      },
      h5: {
        fontSize: typography.fontSize.regular,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.011em",
        lineHeight: 1.6,
      },
      h6: {
        fontSize: typography.fontSize.small,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: "-0.013em",
        lineHeight: 1.5,
      },
      body1: {
        fontSize: typography.fontSize.regular,
        lineHeight: 1.6,
        letterSpacing: "-0.011em",
      },
      body2: {
        fontSize: typography.fontSize.small,
        lineHeight: 1.5,
        letterSpacing: "-0.013em",
      },
      caption: {
        fontSize: typography.fontSize.mini,
        lineHeight: 1.4,
        color: colors.fg.tertiary,
      },
      overline: {
        fontSize: typography.fontSize.micro,
        fontWeight: typography.fontWeight.medium,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: colors.fg.quaternary,
      },
      button: {
        textTransform: "none" as const,
        fontWeight: typography.fontWeight.medium,
        fontSize: typography.fontSize.small,
      },
    },
    shape: {
      borderRadius: 8,
    },
    shadows: [
      "none",
      shadows.low,
      shadows.low,
      shadows.medium,
      shadows.medium,
      shadows.medium,
      shadows.medium,
      shadows.medium,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
      shadows.high,
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: colors.bg.primary,
            color: colors.fg.primary,
            scrollbarColor: `${colors.scrollbar.default} transparent`,
            "&::-webkit-scrollbar": {
              width: "6px",
              height: "6px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: colors.scrollbar.default,
              borderRadius: radius.rounded,
              "&:hover": {
                backgroundColor: colors.scrollbar.hover,
              },
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: radius[6],
            fontWeight: typography.fontWeight.medium,
            boxShadow: "none",
            "&:hover": {
              boxShadow: "none",
            },
          },
          sizeSmall: {
            height: 28,
            fontSize: typography.fontSize.mini,
            padding: "4px 10px",
          },
          sizeMedium: {
            height: 32,
            fontSize: typography.fontSize.small,
            padding: "6px 14px",
          },
          sizeLarge: {
            height: 40,
            fontSize: typography.fontSize.regular,
            padding: "8px 20px",
          },
          contained: {
            backgroundColor: colors.brand.indigo,
            "&:hover": {
              backgroundColor: colors.brand.accentHover,
            },
          },
          outlined: {
            borderColor: colors.border.secondary,
            color: colors.fg.secondary,
            "&:hover": {
              borderColor: colors.border.tertiary,
              backgroundColor: colors.bg.translucent,
            },
          },
          text: {
            color: colors.fg.secondary,
            "&:hover": {
              backgroundColor: colors.bg.translucent,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: colors.fg.tertiary,
            borderRadius: radius[6],
            "&:hover": {
              backgroundColor: colors.bg.translucent,
              color: colors.fg.primary,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: colors.bg.level1,
            border: `1px solid ${colors.border.primary}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: colors.bg.level1,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: radius[12],
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.bg.level1,
            border: `1px solid ${colors.border.secondary}`,
            borderRadius: radius[12],
            boxShadow: shadows.high,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: colors.border.primary,
            fontSize: typography.fontSize.small,
          },
          head: {
            fontWeight: typography.fontWeight.medium,
            color: colors.fg.tertiary,
            backgroundColor: colors.bg.level1,
            fontSize: typography.fontSize.mini,
            textTransform: "uppercase" as const,
            letterSpacing: "0.04em",
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor: `${colors.bg.translucent} !important`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius[6],
            fontSize: typography.fontSize.small,
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: colors.border.tertiary,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: focusRing.color,
              borderWidth: "1px",
            },
          },
          notchedOutline: {
            borderColor: colors.border.primary,
          },
          input: {
            padding: "8px 12px",
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: colors.fg.tertiary,
            fontSize: typography.fontSize.small,
            "&.Mui-focused": {
              color: colors.brand.indigo,
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: {
            color: colors.fg.quaternary,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: typography.fontSize.small,
            borderRadius: radius[4],
            margin: "2px 4px",
            "&:hover": {
              backgroundColor: colors.bg.translucent,
            },
            "&.Mui-selected": {
              backgroundColor: colors.brand.accentTint,
              "&:hover": {
                backgroundColor: colors.brand.accentTint,
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radius[4],
            height: 24,
            fontSize: typography.fontSize.mini,
            fontWeight: typography.fontWeight.medium,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: colors.bg.quaternary,
            color: colors.fg.primary,
            fontSize: typography.fontSize.mini,
            borderRadius: radius[6],
            border: `1px solid ${colors.border.secondary}`,
            padding: "4px 8px",
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: colors.border.primary,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.bg.panel,
            borderRight: `1px solid ${colors.border.primary}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.header.background,
            borderBottom: `1px solid ${colors.header.border}`,
            boxShadow: "none",
            backdropFilter: "blur(12px)",
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: {
            color: colors.fg.tertiary,
            borderTop: `1px solid ${colors.border.primary}`,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: radius[8],
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: colors.border.secondary,
            padding: 6,
            borderRadius: radius[4],
            "&.Mui-checked": {
              color: colors.brand.indigo,
            },
            "&:hover": {
              backgroundColor: colors.bg.translucent,
            },
          },
        },
        defaultProps: {
          size: "small",
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: {
            color: colors.border.secondary,
            padding: 6,
            "&.Mui-checked": {
              color: colors.brand.indigo,
            },
            "&:hover": {
              backgroundColor: colors.bg.translucent,
            },
          },
        },
        defaultProps: {
          size: "small",
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          root: {
            marginLeft: -6,
          },
          label: {
            fontSize: typography.fontSize.small,
            color: colors.fg.secondary,
          },
        },
      },
    },
  },
  koKR
);

export default theme;
export { theme };
