"use client";

import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RateReviewIcon from "@mui/icons-material/RateReview";
import ScoreIcon from "@mui/icons-material/Score";
import { PageHeader, Box, StatCard, DataTable, GradeBadge, type Column } from "@trustee/ui";
import { spacing } from "@trustee/ui";
import { useChecklistStats, useRecentSubmitted } from "@/hooks";
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

export default function InspectionsPage() {
  const router = useRouter();
  const { data: statsData } = useChecklistStats();
  const { data: recentData } = useRecentSubmitted(5);

  const stats = statsData?.data;
  const recentItems = recentData?.data ?? [];

  const recentColumns: Column<RecentItem>[] = [
    { id: "title", label: "제목", minWidth: 200 },
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
        title="점검 관리"
        description="보안점검 체크리스트 템플릿과 수탁사별 체크리스트를 관리합니다."
      />

      {/* 통계 카드 */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
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
          label="검토완료"
          value={stats?.reviewed ?? 0}
          icon={<RateReviewIcon />}
        />
        <StatCard
          label="평균 점수"
          value={stats?.averageScore != null ? `${stats.averageScore}점` : "-"}
          icon={<ScoreIcon />}
        />
      </Box>

      {/* 최근 제출 체크리스트 */}
      {recentItems.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            최근 제출된 체크리스트
          </Typography>
          <DataTable
            columns={recentColumns}
            rows={recentItems}
            getRowKey={(row) => row.id}
            page={0}
            rowsPerPage={5}
            totalRows={recentItems.length}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            onRowClick={(row) => router.push(`/inspections/checklists/${row.id}`)}
          />
        </Box>
      )}

      {/* 빠른 이동 카드 */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <Card sx={{ flex: "1 1 300px", maxWidth: 400 }}>
          <CardActionArea onClick={() => router.push("/inspections/templates")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
              <ListAltIcon sx={{ fontSize: 40, color: "primary.main" }} />
              <Box>
                <Typography variant="h6">체크리스트 템플릿</Typography>
                <Typography variant="body2" color="text.secondary">
                  Root 템플릿을 관리합니다. JSON Import로 생성할 수 있습니다.
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card sx={{ flex: "1 1 300px", maxWidth: 400 }}>
          <CardActionArea onClick={() => router.push("/inspections/checklists")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
              <AssignmentTurnedInIcon sx={{ fontSize: 40, color: "success.main" }} />
              <Box>
                <Typography variant="h6">수탁사 체크리스트</Typography>
                <Typography variant="body2" color="text.secondary">
                  수탁사에게 전달할 보안점검 체크리스트를 생성하고 관리합니다.
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
}
