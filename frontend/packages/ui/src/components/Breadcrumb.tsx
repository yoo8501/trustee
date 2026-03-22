"use client";

import MuiBreadcrumbs from "@mui/material/Breadcrumbs";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { colors } from "../theme/tokens";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate?: (href: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <MuiBreadcrumbs
      separator={<NavigateNextIcon sx={{ fontSize: 16, color: colors.fg.quaternary }} />}
      sx={{ mb: 1 }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        if (isLast || !item.href) {
          return (
            <Typography
              key={index}
              variant="body2"
              sx={{ color: isLast ? colors.fg.secondary : colors.fg.tertiary, fontSize: "0.8125rem" }}
            >
              {item.label}
            </Typography>
          );
        }
        return (
          <MuiLink
            key={index}
            component="button"
            variant="body2"
            underline="hover"
            onClick={() => onNavigate?.(item.href!)}
            sx={{
              color: colors.fg.tertiary,
              fontSize: "0.8125rem",
              cursor: "pointer",
              "&:hover": { color: colors.fg.primary },
            }}
          >
            {item.label}
          </MuiLink>
        );
      })}
    </MuiBreadcrumbs>
  );
}
