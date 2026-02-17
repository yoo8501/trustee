"use client";

import MuiIconButton, {
  IconButtonProps as MuiIconButtonProps,
} from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

export interface IconButtonProps extends MuiIconButtonProps {
  tooltip?: string;
}

export function IconButton({ tooltip, children, ...props }: IconButtonProps) {
  const button = <MuiIconButton size="small" {...props}>{children}</MuiIconButton>;

  if (tooltip) {
    return <Tooltip title={tooltip}>{button}</Tooltip>;
  }

  return button;
}
