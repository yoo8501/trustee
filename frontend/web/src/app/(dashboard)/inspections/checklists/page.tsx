"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddIcon from "@mui/icons-material/Add";
import Chip from "@mui/material/Chip";
import {
  PageHeader,
  Button,
  DataTable,
  FormSelect,
  Box,
  CircularProgress,
  type Column,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { TrusteeChecklist } from "@trustee/types";
import { useTrusteeChecklists } from "@/hooks";

const statusOptions = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "sent", label: "전달됨" },
  { value: "in_progress", label: "작성중" },
  { value: "submitted", label: "제출완료" },
  { value: "reviewed", label: "검토완료" },
];

const statusColorMap: Record<string, "default" | "info" | "warning" | "success" | "primary"> = {
  draft: "default",
  sent: "info",
  in_progress: "warning",
  submitted: "primary",
  reviewed: "success",
};

const statusLabelMap: Record<string, string> = {
  draft: "초안",
  sent: "전달됨",
  in_progress: "작성중",
  submitted: "제출완료",
  reviewed: "검토완료",
};

export default function ChecklistsPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading } = useTrusteeChecklists({
    page: page + 1,
    limit: rowsPerPage,
    status: statusFilter || undefined,
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
      id: "status",
      label: "상태",
      minWidth: 100,
      render: (row) => (
        <Chip
          label={statusLabelMap[row.status] || row.status}
          color={statusColorMap[row.status] || "default"}
          size="small"
        />
      ),
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
      id: "submissionCount" as keyof TrusteeChecklist,
      label: "제출",
      minWidth: 60,
      align: "center" as const,
      render: (row) => (row as unknown as Record<string, number>).submissionCount || 0,
    },
    {
      id: "createdAt",
      label: "생성일",
      minWidth: 120,
      render: (row) => new Date(row.createdAt).toLocaleDateString("ko-KR"),
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
        <FormSelect
          label="상태"
          name="statusFilter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as string)}
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
