"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddIcon from "@mui/icons-material/Add";
import DescriptionIcon from "@mui/icons-material/Description";
import Typography from "@mui/material/Typography";
import {
  PageHeader,
  Button,
  DataTable,
  EmptyState,
  TableSkeleton,
  Breadcrumb,
  Box,
  type Column,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { ChecklistTemplate } from "@trustee/types";
import { useChecklistTemplates } from "@/hooks";

export default function TemplatesPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { data, isLoading, isError, refetch } = useChecklistTemplates({
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

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <Breadcrumb
        items={[
          { label: "대시보드", href: "/" },
          { label: "점검 관리", href: "/inspections" },
          { label: "체크리스트 템플릿" },
        ]}
        onNavigate={(href) => router.push(href)}
      />
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

      {isLoading ? (
        <TableSkeleton rows={5} columns={columns.length} />
      ) : isError ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography color="error" gutterBottom>
            데이터를 불러오는데 실패했습니다.
          </Typography>
          <Button variant="outlined" onClick={() => refetch()}>
            다시 시도
          </Button>
        </Box>
      ) : data?.data?.length === 0 ? (
        <EmptyState
          icon={<DescriptionIcon />}
          title="등록된 템플릿이 없습니다"
          description="보안점검 체크리스트 템플릿을 생성하세요."
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => router.push("/inspections/templates/new")}
            >
              템플릿 생성
            </Button>
          }
        />
      ) : (
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
      )}
    </Box>
  );
}
