"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { colors } from "@trustee/ui";

export interface ChecklistProgressBarProps {
  completed: number;
  total: number;
}

export function ChecklistProgressBar({ completed, total }: ChecklistProgressBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
          {completed}/{total}
        </Typography>
        <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
          {percent}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.border.secondary,
          "& .MuiLinearProgress-bar": {
            backgroundColor: percent === 100 ? "#27a644" : "#5e6ad2",
            borderRadius: 3,
          },
        }}
      />
    </Box>
  );
}
