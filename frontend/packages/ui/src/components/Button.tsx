"use client";

import MuiButton, { ButtonProps as MuiButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

export interface ButtonProps extends MuiButtonProps {
  loading?: boolean;
}

export function Button({
  loading,
  disabled,
  children,
  size = "medium",
  ...props
}: ButtonProps) {
  return (
    <MuiButton disabled={disabled || loading} size={size} {...props}>
      {loading ? (
        <CircularProgress
          size={size === "small" ? 14 : size === "large" ? 20 : 16}
          color="inherit"
          sx={{ mr: children ? 1 : 0 }}
        />
      ) : null}
      {loading ? null : children}
    </MuiButton>
  );
}
