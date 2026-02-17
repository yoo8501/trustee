"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BusinessIcon from "@mui/icons-material/Business";
import DescriptionIcon from "@mui/icons-material/Description";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { Layout, Header, type NavItem, CircularProgress, Box, colors } from "@trustee/ui";
import { useAuth } from "@/hooks";

const navItems: NavItem[] = [
  { label: "대시보드", href: "/", icon: <DashboardIcon /> },
  { label: "수탁사 관리", href: "/trustees", icon: <BusinessIcon /> },
  { label: "계약 관리", href: "/contracts", icon: <DescriptionIcon /> },
  { label: "점검 관리", href: "/inspections", icon: <AssignmentIcon /> },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg.primary,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Layout
      navItems={navItems}
      onNavigate={(href) => router.push(href)}
      currentPath={pathname}
      header={
        <Header
          user={user ? { name: user.name, email: user.email } : undefined}
          onLogout={logout}
        />
      }
    >
      {children}
    </Layout>
  );
}
