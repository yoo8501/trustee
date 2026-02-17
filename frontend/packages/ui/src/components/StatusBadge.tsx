"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { colors } from "../theme/tokens";

type Status = "active" | "inactive" | "pending" | "error" | "warning";

const statusConfig: Record<Status, { color: string; bg: string; label: string }> = {
  active: { color: colors.brand.green, bg: "#27a64418", label: "활성" },
  inactive: { color: colors.fg.quaternary, bg: "#62666d18", label: "비활성" },
  pending: { color: colors.brand.yellow, bg: "#f0bf0018", label: "대기" },
  error: { color: colors.brand.red, bg: "#eb575718", label: "오류" },
  warning: { color: colors.brand.orange, bg: "#fc784018", label: "주의" },
};

export interface StatusBadgeProps {
  status: Status;
  label?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.inactive;
  const displayLabel = label ?? config.label;

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: size === "sm" ? 1 : 1.25,
        py: size === "sm" ? 0.25 : 0.375,
        borderRadius: "9999px",
        backgroundColor: config.bg,
      }}
    >
      <Box
        component="span"
        sx={{
          width: size === "sm" ? 6 : 7,
          height: size === "sm" ? 6 : 7,
          borderRadius: "50%",
          backgroundColor: config.color,
          flexShrink: 0,
        }}
      />
      <Typography
        component="span"
        sx={{
          fontSize: size === "sm" ? "0.6875rem" : "0.75rem",
          fontWeight: 500,
          color: config.color,
          lineHeight: 1,
        }}
      >
        {displayLabel}
      </Typography>
    </Box>
  );
}
