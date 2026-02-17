"use client";

import Grid from "@mui/material/Grid2";
import BusinessIcon from "@mui/icons-material/Business";
import DescriptionIcon from "@mui/icons-material/Description";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { PageHeader, StatCard, Box, spacing } from "@trustee/ui";
import { useTrustees } from "@/hooks";

export default function DashboardPage() {
  const { data: trusteesData } = useTrustees({ page: 1, limit: 1 });
  const trusteeCount = trusteesData?.total ?? 0;

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="대시보드"
        description="수탁사 관리 현황을 한눈에 확인하세요."
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard
            label="전체 수탁사"
            value={trusteeCount}
            icon={<BusinessIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard
            label="활성 계약"
            value="-"
            icon={<DescriptionIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard
            label="예정 점검"
            value="-"
            icon={<AssignmentIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard
            label="완료 점검"
            value="-"
            icon={<CheckCircleIcon />}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
