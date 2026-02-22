"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import {
  PageHeader,
  Button,
  DataTable,
  FormSelect,
  Box,
  CircularProgress,
  GradeBadge,
  type Column,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { TrusteeChecklist } from "@trustee/types";
import { useTrusteeChecklists, useTrusteeMap } from "@/hooks";
import { InspectionStatusChip, type InspectionStatus } from "@/components/InspectionStatusChip";
import { ChecklistProgressBar } from "@/components/ChecklistProgressBar";
import { scoreToUIGrade } from "@/lib/inspection-utils";

const statusOptions = [
  { value: "all", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "sent", label: "전달됨" },
  { value: "in_progress", label: "작성중" },
  { value: "submitted", label: "제출완료" },
  { value: "reviewed", label: "검토완료" },
];

function calculateProgress(row: TrusteeChecklist): { completed: number; total: number } {
  const total = (row as unknown as Record<string, number>).totalItemCount || 0;
  const completed = (row as unknown as Record<string, number>).answeredCount || 0;
  return { completed, total };
}

export default function ChecklistsPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const trusteeMap = useTrusteeMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useTrusteeChecklists({
    page: page + 1,
    limit: rowsPerPage,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
  });

  const columns: Column<TrusteeChecklist>[] = [
    {
      id: "no",
      label: "No.",
      minWidth: 50,
      align: "center",
      render: (_row, index) => page * rowsPerPage + index + 1,
    },
    { id: "title", label: "제목", minWidth: 200 },
    {
      id: "trusteeName" as keyof TrusteeChecklist,
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
      id: "totalScore" as keyof TrusteeChecklist,
      label: "점수/등급",
      minWidth: 140,
      render: (row) => {
        const score = (row as unknown as Record<string, number | null>).totalScore;
        const grade = (row as unknown as Record<string, string | null>).grade;
        if (score != null && grade) {
          const uiGrade = scoreToUIGrade(score);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">{score}점</Typography>
              <GradeBadge grade={uiGrade} size="sm" />
            </Box>
          );
        }
        if (row.status === "in_progress") {
          const { completed, total } = calculateProgress(row);
          return <ChecklistProgressBar completed={completed} total={total} />;
        }
        return <Typography variant="body2" color="text.disabled">-</Typography>;
      },
    },
    {
      id: "contactName",
      label: "작성자",
      minWidth: 100,
      render: (row) => row.contactName || "-",
    },
    {
      id: "accessTokenExpiresAt" as keyof TrusteeChecklist,
      label: "작성 기한",
      minWidth: 100,
      render: (row) => {
        if (!row.accessTokenExpiresAt) return "-";
        const expired = new Date() > new Date(row.accessTokenExpiresAt);
        const days = Math.ceil(
          (new Date(row.accessTokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return (
          <Chip
            label={expired ? "만료됨" : `D-${days}`}
            color={expired ? "error" : days <= 3 ? "warning" : "info"}
            size="small"
          />
        );
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

  if (isLoading) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px`, display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="수탁사 체크리스트"
        description="수탁사에게 전달된 보안점검 체크리스트를 관리합니다."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/inspections/checklists/new")}
          >
            체크리스트 생성
          </Button>
        }
      />

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="제목, 작성자 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 250 }}
        />
        <FormSelect
          label="상태"
          name="statusFilter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as string); setPage(0); }}
          options={statusOptions}
          sx={{ minWidth: 120 }}
        />
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        getRowKey={(row) => row.id}
        page={page}
        rowsPerPage={rowsPerPage}
        totalRows={data?.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={(row) => router.push(`/inspections/checklists/${row.id}`)}
      />
    </Box>
  );
}
