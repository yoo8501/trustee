"use client";

import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import { colors } from "../theme/tokens";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <Box
      sx={{
        borderRadius: "8px",
        border: `1px solid ${colors.border.primary}`,
        overflow: "hidden",
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          p: 1.5,
          borderBottom: `1px solid ${colors.border.primary}`,
          bgcolor: colors.bg.secondary,
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            variant="text"
            width={`${100 / columns}%`}
            sx={{ bgcolor: colors.bg.tertiary }}
          />
        ))}
      </Box>
      {/* 로우 */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: "flex",
            gap: 2,
            p: 1.5,
            borderBottom:
              rowIndex < rows - 1
                ? `1px solid ${colors.border.primary}`
                : "none",
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              width={`${100 / columns}%`}
              sx={{ bgcolor: colors.bg.tertiary }}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}
