"use client";

import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import BusinessIcon from "@mui/icons-material/Business";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScoreIcon from "@mui/icons-material/Score";
import AddIcon from "@mui/icons-material/Add";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { PageHeader, StatCard, DataTable, GradeBadge, Box, Button, type Column, spacing } from "@trustee/ui";
import { useTrustees, useChecklistStats, useRecentSubmitted, useTrusteeMap } from "@/hooks";
import { InspectionStatusChip, type InspectionStatus } from "@/components/InspectionStatusChip";
import { scoreToUIGrade } from "@/lib/inspection-utils";

interface RecentItem {
  id: string;
  title: string;
  trusteeId: string;
  status: string;
  totalScore: number | null;
  grade: string | null;
  submittedAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: trusteesData } = useTrustees({ page: 1, limit: 1 });
  const { data: statsData } = useChecklistStats();
  const { data: recentData } = useRecentSubmitted(5);
  const trusteeMap = useTrusteeMap();

  const trusteeCount = trusteesData?.total ?? 0;
  const stats = statsData?.data;
  const recentItems: RecentItem[] = recentData?.data ?? [];

  const recentColumns: Column<RecentItem>[] = [
    { id: "title", label: "제목", minWidth: 200 },
    {
      id: "trusteeName" as keyof RecentItem,
      label: "수탁사",
      minWidth: 120,
      render: (row) => trusteeMap.get(row.trusteeId) || "-",
    },
    {
      id: "status",
      label: "상태",
      minWidth: 100,
      render: (row) => (
        <InspectionStatusChip status={row.status as InspectionStatus} />
      ),
    },
    {
      id: "totalScore" as keyof RecentItem,
      label: "점수/등급",
      minWidth: 120,
      render: (row) => {
        if (row.totalScore != null) {
          const uiGrade = scoreToUIGrade(row.totalScore);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">{row.totalScore}점</Typography>
              <GradeBadge grade={uiGrade} size="sm" />
            </Box>
          );
        }
        return <Typography variant="body2" color="text.disabled">-</Typography>;
      },
    },
    {
      id: "submittedAt",
      label: "제출일",
      minWidth: 120,
      render: (row) =>
        row.submittedAt ? new Date(row.submittedAt).toLocaleDateString("ko-KR") : "-",
    },
  ];

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="대시보드"
        description="수탁사 관리 현황을 한눈에 확인하세요."
      />

      {/* 통계 카드 */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        <StatCard
          label="전체 수탁사"
          value={trusteeCount}
          icon={<BusinessIcon />}
        />
        <StatCard
          label="총 체크리스트"
          value={stats?.total ?? 0}
          icon={<AssignmentIcon />}
        />
        <StatCard
          label="제출완료"
          value={stats?.submitted ?? 0}
          icon={<CheckCircleIcon />}
        />
        <StatCard
          label="평균 점수"
          value={stats?.averageScore != null ? `${stats.averageScore}점` : "-"}
          icon={<ScoreIcon />}
        />
      </Box>

      {/* 빠른 작업 카드 */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}>
        <Card
          variant="outlined"
          sx={{
            borderLeft: 4,
            borderColor: "primary.main",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <CardActionArea onClick={() => router.push("/trustees/new")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
              <AddIcon sx={{ fontSize: 32, color: "primary.main" }} />
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>수탁사 등록</Typography>
                <Typography variant="body2" color="text.secondary">
                  새로운 수탁사를 등록합니다
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card
          variant="outlined"
          sx={{
            borderLeft: 4,
            borderColor: "success.main",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <CardActionArea onClick={() => router.push("/inspections/checklists/new")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
              <ListAltIcon sx={{ fontSize: 32, color: "success.main" }} />
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>체크리스트 생성</Typography>
                <Typography variant="body2" color="text.secondary">
                  수탁사 보안점검 체크리스트를 생성합니다
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>

      {/* 최근 제출 체크리스트 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          최근 제출된 체크리스트
        </Typography>
        {recentItems.length > 0 ? (
          <DataTable
            columns={recentColumns}
            rows={recentItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/inspections/checklists/${row.id}`)}
          />
        ) : (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
            <AssignmentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              아직 제출된 체크리스트가 없습니다
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
              수탁사 체크리스트를 생성하고 수탁사에게 전달하세요
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => router.push("/inspections/checklists/new")}
            >
              체크리스트 생성
            </Button>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
