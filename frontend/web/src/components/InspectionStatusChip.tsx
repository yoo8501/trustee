"use client";

import Chip from "@mui/material/Chip";
import { inspectionColors } from "@trustee/ui";

export type InspectionStatus = "draft" | "sent" | "in_progress" | "submitted" | "reviewed";

const MUI_COLOR_MAP: Record<InspectionStatus, "default" | "info" | "warning" | "primary" | "success"> = {
  draft:       "default",
  sent:        "info",
  in_progress: "warning",
  submitted:   "primary",
  reviewed:    "success",
};

export interface InspectionStatusChipProps {
  status: InspectionStatus;
  size?: "small" | "medium";
}

export function InspectionStatusChip({ status, size = "small" }: InspectionStatusChipProps) {
  const statusKey = status as keyof typeof inspectionColors.status;
  const label = inspectionColors.status[statusKey]?.label ?? status;
  const color = MUI_COLOR_MAP[status] ?? "default";

  return <Chip label={label} color={color} size={size} />;
}
