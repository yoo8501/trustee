"use client";

import Box from "@mui/material/Box";
import { ReactNode } from "react";
import { colors, radius } from "../theme/tokens";

export interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <Box
      component="kbd"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 20,
        px: 0.5,
        fontSize: "0.6875rem",
        fontFamily: "inherit",
        fontWeight: 500,
        lineHeight: 1,
        color: colors.fg.tertiary,
        backgroundColor: colors.bg.tertiary,
        border: `1px solid ${colors.border.secondary}`,
        borderRadius: radius[4],
        boxShadow: `0 1px 0 ${colors.border.secondary}`,
      }}
    >
      {children}
    </Box>
  );
}
