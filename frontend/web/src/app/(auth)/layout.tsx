"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "background.default",
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={1}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 2,
          }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}
