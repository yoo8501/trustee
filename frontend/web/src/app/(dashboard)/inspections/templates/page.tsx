"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddIcon from "@mui/icons-material/Add";
import {
  PageHeader,
  Button,
  DataTable,
  Box,
  CircularProgress,
  type Column,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { ChecklistTemplate } from "@trustee/types";
import { useChecklistTemplates } from "@/hooks";

export default function TemplatesPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { data, isLoading } = useChecklistTemplates({
    page: page + 1,
    limit: rowsPerPage,
  });

  const columns: Column<ChecklistTemplate>[] = [
    {
      id: "no",
      label: "No.",
      minWidth: 50,
      align: "center",
      render: (_row, index) => page * rowsPerPage + index + 1,
    },
    { id: "title", label: "템플릿명", minWidth: 200 },
    { id: "version", label: "버전", minWidth: 80, align: "center" },
    {
      id: "categories",
      label: "범주 수",
      minWidth: 80,
      align: "center",
      render: (row) => row.categories?.length ?? 0,
    },
    {
      id: "createdAt",
      label: "생성일",
      minWidth: 120,
      render: (row) => new Date(row.createdAt).toLocaleDateString("ko-KR"),
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
        title="체크리스트 템플릿"
        description="보안점검 체크리스트의 Root 템플릿을 관리합니다."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/inspections/templates/new")}
          >
            템플릿 생성
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        getRowKey={(row) => row.id}
        page={page}
        rowsPerPage={rowsPerPage}
        totalRows={data?.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={(row) => router.push(`/inspections/templates/${row.id}`)}
      />
    </Box>
  );
}
