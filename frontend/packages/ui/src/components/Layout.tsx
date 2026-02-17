"use client";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import MuiIconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import { ReactNode, useState } from "react";
import { colors, spacing } from "../theme/tokens";

const SIDEBAR_WIDTH = spacing.sidebarWidth;

export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface LayoutProps {
  children: ReactNode;
  title?: string;
  navItems?: NavItem[];
  onNavigate?: (href: string) => void;
  currentPath?: string;
}

export function Layout({
  children,
  title = "Trustee",
  navItems = [],
  onNavigate,
  currentPath,
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const sidebar = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: colors.bg.panel,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: `1px solid ${colors.border.primary}`,
          minHeight: spacing.headerHeight,
        }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "6px",
            background: `linear-gradient(135deg, ${colors.brand.indigo}, ${colors.brand.accent})`,
          }}
        />
        <Typography
          variant="h5"
          sx={{ color: colors.fg.primary, fontWeight: 600 }}
        >
          {title}
        </Typography>
      </Box>

      <List sx={{ flex: 1, px: 1, py: 1 }}>
        {navItems.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <ListItem key={item.href} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                onClick={() => {
                  onNavigate?.(item.href);
                  setMobileOpen(false);
                }}
                sx={{
                  borderRadius: "6px",
                  py: 0.75,
                  px: 1.5,
                  minHeight: 32,
                  backgroundColor: isActive
                    ? colors.bg.translucent
                    : "transparent",
                  color: isActive ? colors.fg.primary : colors.fg.tertiary,
                  "&:hover": {
                    backgroundColor: colors.bg.translucent,
                    color: colors.fg.primary,
                  },
                }}
              >
                {item.icon && (
                  <ListItemIcon
                    sx={{
                      minWidth: 28,
                      color: "inherit",
                      "& .MuiSvgIcon-root": { fontSize: 18 },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={item.label}
                  slotProps={{
                    primary: {
                      sx: { fontSize: "0.8125rem", fontWeight: isActive ? 500 : 400 },
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Mobile toggle */}
      <MuiIconButton
        onClick={handleDrawerToggle}
        sx={{
          display: { sm: "none" },
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 1300,
        }}
      >
        <MenuIcon />
      </MuiIconButton>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", sm: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH,
          },
        }}
      >
        {sidebar}
      </Drawer>

      {/* Desktop sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", sm: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH,
            borderRight: "none",
          },
        }}
        open
      >
        {sidebar}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: "100vh",
          ml: { sm: `${SIDEBAR_WIDTH}px` },
          backgroundColor: colors.bg.primary,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
