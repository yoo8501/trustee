"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ReactNode } from "react";
import { colors } from "../theme/tokens";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
        px: 3,
        textAlign: "center",
      }}
    >
      {icon && (
        <Box sx={{ mb: 2, color: colors.fg.quaternary, "& .MuiSvgIcon-root": { fontSize: 40 } }}>
          {icon}
        </Box>
      )}
      <Typography
        variant="h5"
        sx={{ mb: 0.5, color: colors.fg.secondary }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          sx={{ color: colors.fg.tertiary, maxWidth: 360 }}
        >
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 3 }}>{action}</Box>}
    </Box>
  );
}
