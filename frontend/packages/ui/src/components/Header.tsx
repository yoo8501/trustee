"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import LogoutIcon from "@mui/icons-material/Logout";
import { colors, spacing } from "../theme/tokens";
import { IconButton } from "./IconButton";

export interface HeaderUser {
  name: string;
  email?: string;
}

export interface HeaderProps {
  user?: HeaderUser;
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        height: spacing.headerHeight,
        px: 2.5,
        gap: 1.5,
        backgroundColor: colors.header.background,
        borderBottom: `1px solid ${colors.header.border}`,
        backdropFilter: "blur(12px)",
      }}
    >
      {user && (
        <>
          <Typography
            variant="body2"
            sx={{ color: colors.fg.secondary, fontSize: "0.8125rem" }}
          >
            {user.name}
          </Typography>
          <Avatar
            sx={{
              width: 28,
              height: 28,
              fontSize: "0.75rem",
              fontWeight: 500,
              backgroundColor: colors.brand.indigo,
              color: colors.brand.white,
            }}
          >
            {initials}
          </Avatar>
          <IconButton tooltip="로그아웃" onClick={onLogout}>
            <LogoutIcon sx={{ fontSize: 18, color: colors.fg.tertiary }} />
          </IconButton>
        </>
      )}
    </Box>
  );
}
