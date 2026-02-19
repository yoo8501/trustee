"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddIcon from "@mui/icons-material/Add";
import {
  PageHeader,
  Button,
  DataTable,
  StatusBadge,
  SearchInput,
  FormSelect,
  Box,
  CircularProgress,
  type Column,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { Trustee } from "@trustee/types";
import { useTrustees } from "@/hooks";

const statusOptions = [
  { value: "", label: "전체" },
  { value: "active", label: "활성" },
  { value: "inactive", label: "비활성" },
  { value: "pending", label: "대기" },
];

export default function TrusteesPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const columns: Column<Trustee>[] = [
    {
      id: "no",
      label: "No.",
      minWidth: 50,
      align: "center",
      render: (_row, index) => page * rowsPerPage + index + 1,
    },
    { id: "companyName", label: "회사명", minWidth: 150 },
    { id: "businessNumber", label: "사업자번호", minWidth: 130, render: (row) => row.businessNumber || "-" },
    { id: "representative", label: "대표자", minWidth: 100, render: (row) => row.representative || "-" },
    {
      id: "contacts",
      label: "주담당자",
      minWidth: 120,
      render: (row) => {
        const primary = row.contacts?.find((c) => c.isPrimary);
        return primary?.name ?? "-";
      },
    },
    {
      id: "status",
      label: "상태",
      minWidth: 80,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const { data, isLoading } = useTrustees({
    page: page + 1,
    limit: rowsPerPage,
    search: search || undefined,
    status: statusFilter || undefined,
  });

  if (isLoading) {
    return (
      <Box
        sx={{
          p: `${spacing.pageInset}px`,
          display: "flex",
          justifyContent: "center",
          pt: 10,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="수탁사 관리"
        description="개인정보 처리 업무를 위탁받은 수탁사를 관리합니다."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/trustees/new")}
          >
            수탁사 등록
          </Button>
        }
      />

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
        <Box sx={{ flex: 1, maxWidth: 320 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="회사명, 사업자번호 검색..."
          />
        </Box>
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
        onRowClick={(row) => router.push(`/trustees/${row.id}`)}
      />
    </Box>
  );
}
