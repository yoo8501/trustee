"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ReactNode } from "react";
import { colors, radius } from "../theme/tokens";

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon,
}: StatCardProps) {
  const changeColor =
    changeType === "positive"
      ? colors.brand.green
      : changeType === "negative"
        ? colors.brand.red
        : colors.fg.tertiary;

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: radius[12],
        border: `1px solid ${colors.border.primary}`,
        backgroundColor: colors.bg.level1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Typography
          variant="body2"
          sx={{ color: colors.fg.tertiary, fontWeight: 500 }}
        >
          {label}
        </Typography>
        {icon && (
          <Box sx={{ color: colors.fg.quaternary, "& .MuiSvgIcon-root": { fontSize: 18 } }}>
            {icon}
          </Box>
        )}
      </Box>
      <Typography
        variant="h2"
        sx={{ color: colors.fg.primary, fontWeight: 600 }}
      >
        {value}
      </Typography>
      {change && (
        <Typography
          variant="caption"
          sx={{ color: changeColor, mt: 0.5, display: "block" }}
        >
          {change}
        </Typography>
      )}
    </Box>
  );
}
