"use client";

import Box from "@mui/material/Box";
import { inspectionColors } from "../theme/tokens";

export type UIGrade = "A+" | "A" | "B+" | "B" | "C" | "D";

export interface GradeBadgeProps {
  grade: UIGrade;
  size?: "sm" | "md" | "lg";
}

const KEY_MAP: Record<UIGrade, keyof typeof inspectionColors.grade> = {
  "A+": "aPlus", "A": "a", "B+": "bPlus", "B": "b", "C": "c", "D": "d",
};

const SIZE_MAP = {
  sm: { px: 1, py: 0.25, fontSize: "0.6875rem", minWidth: 28 },
  md: { px: 1.25, py: 0.375, fontSize: "0.75rem", minWidth: 36 },
  lg: { px: 2, py: 0.75, fontSize: "0.9375rem", minWidth: 48 },
};

export function GradeBadge({ grade, size = "md" }: GradeBadgeProps) {
  const colors = inspectionColors.grade[KEY_MAP[grade]];
  const s = SIZE_MAP[size];

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        px: s.px,
        py: s.py,
        borderRadius: "6px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        fontWeight: 600,
        color: colors.text,
        fontSize: s.fontSize,
        letterSpacing: "0.05em",
        minWidth: s.minWidth,
      }}
    >
      {grade}
    </Box>
  );
}
