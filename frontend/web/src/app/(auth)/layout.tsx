"use client";

import type { ReactNode } from "react";
import { Box, Container, Paper, colors } from "@trustee/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg.primary,
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: "12px",
            backgroundColor: colors.bg.level1,
            border: `1px solid ${colors.border.primary}`,
          }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}
