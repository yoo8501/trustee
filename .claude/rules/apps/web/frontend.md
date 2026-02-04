# Frontend Rules (Next.js 15 + React 19)

## 아키텍처
```
apps/web/src/
├── app/                  # App Router
│   ├── (dashboard)/      # 대시보드 레이아웃 그룹
│   │   ├── layout.tsx    # Layout 컴포넌트 + 네비게이션
│   │   ├── page.tsx      # 대시보드 메인
│   │   ├── trustees/     # 수탁사 페이지
│   │   ├── contracts/    # 계약 페이지
│   │   └── inspections/  # 점검 페이지
│   └── api/              # (사용 안함 - 외부 Gateway 사용)
├── components/           # 페이지 전용 컴포넌트
├── hooks/                # React Query 커스텀 훅
└── lib/
    └── api/              # API 클라이언트 레이어
```

## API 호출 흐름
```
페이지/컴포넌트 → React Query 훅 (hooks/) → API 클라이언트 (lib/api/) → Gateway (localhost:3001)
```
Next.js API Routes는 사용하지 않는다. 모든 API 호출은 `lib/api/client.ts`의 `apiClient`를 통해 Gateway로 전달된다.

## API 클라이언트 패턴
- `lib/api/client.ts`의 `apiClient` 인스턴스 사용
- 리소스별 API 객체 생성 (`trusteesApi`, `contractsApi`, `inspectionsApi`)
- 응답 타입 인터페이스 정의 필수
```typescript
import { apiClient } from "./client";
import type { Trustee, CreateTrusteeInput, UpdateTrusteeInput } from "@trustee/types";

interface TrusteeListResponse { data: Trustee[]; total: number; }
interface TrusteeResponse { data: Trustee; }

export const trusteesApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    apiClient.get<TrusteeListResponse>("/api/trustees", params),

  getById: (id: string) =>
    apiClient.get<TrusteeResponse>(`/api/trustees/${id}`),

  create: (data: CreateTrusteeInput) =>
    apiClient.post<TrusteeResponse>("/api/trustees", data),

  update: (id: string, data: UpdateTrusteeInput) =>
    apiClient.patch<TrusteeResponse>(`/api/trustees/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/api/trustees/${id}`),
};
```

## React Query 훅 패턴
- `"use client"` 선언 필수
- 쿼리 키: 상수 배열로 정의 (`const TRUSTEES_KEY = ["trustees"]`)
- 목록 훅: params를 쿼리 키에 포함
- 단건 훅: `enabled: !!id`로 조건부 실행
- Mutation: `onSuccess`에서 `invalidateQueries`로 캐시 무효화
```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTrusteeInput, UpdateTrusteeInput } from "@trustee/types";
import { trusteesApi } from "@/lib/api";

const TRUSTEES_KEY = ["trustees"];

// 목록 조회
export function useTrustees(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: [...TRUSTEES_KEY, params],
    queryFn: () => trusteesApi.list(params),
  });
}

// 단건 조회
export function useTrustee(id: string) {
  return useQuery({
    queryKey: [...TRUSTEES_KEY, id],
    queryFn: () => trusteesApi.getById(id),
    enabled: !!id,
  });
}

// 생성 Mutation
export function useCreateTrustee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTrusteeInput) => trusteesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}

// 수정 Mutation
export function useUpdateTrustee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTrusteeInput }) =>
      trusteesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}

// 삭제 Mutation
export function useDeleteTrustee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trusteesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}
```

## @trustee/ui 컴포넌트 사용법

### DataTable
```tsx
import { DataTable, Column } from "@trustee/ui";

const columns: Column<Trustee>[] = [
  { id: "companyName", label: "회사명", minWidth: 150 },
  { id: "businessNumber", label: "사업자번호", minWidth: 120 },
  { id: "status", label: "상태", render: (row) => <StatusChip status={row.status} /> },
];

<DataTable
  columns={columns}
  rows={data}
  getRowKey={(row) => row.id}
  page={page}
  rowsPerPage={rowsPerPage}
  totalRows={total}
  onPageChange={setPage}
  onRowsPerPageChange={setRowsPerPage}
  onRowClick={(row) => router.push(`/trustees/${row.id}`)}
/>
```

### Button (로딩 상태 지원)
```tsx
import { Button } from "@trustee/ui";

<Button variant="contained" loading={isSubmitting} type="submit">
  저장
</Button>
<Button variant="outlined" color="error" loading={isDeleting} onClick={handleDelete}>
  삭제
</Button>
```

### Dialog (모달)
```tsx
import { Dialog } from "@trustee/ui";

<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="수탁사 삭제"
  maxWidth="xs"
  actions={
    <>
      <Button onClick={() => setOpen(false)}>취소</Button>
      <Button variant="contained" color="error" onClick={handleConfirm}>삭제</Button>
    </>
  }
>
  정말 삭제하시겠습니까?
</Dialog>
```

### Form (React Hook Form 연동)
```tsx
import { Form, FormTextField, FormSelect } from "@trustee/ui";

<Form onSubmit={handleSubmit(onSubmit)}>
  <FormTextField
    label="회사명"
    {...register("companyName")}
    error={errors.companyName?.message}
  />
  <FormSelect
    label="상태"
    options={[
      { value: "active", label: "활성" },
      { value: "inactive", label: "비활성" },
      { value: "pending", label: "대기" },
    ]}
    value={watch("status")}
    onChange={(e) => setValue("status", e.target.value as string)}
    error={errors.status?.message}
  />
  <Button type="submit" variant="contained" loading={isSubmitting}>
    저장
  </Button>
</Form>
```

### Layout (사이드바 네비게이션)
```tsx
import { Layout, NavItem } from "@trustee/ui";

const navItems: NavItem[] = [
  { label: "대시보드", href: "/", icon: <DashboardIcon /> },
  { label: "수탁사 관리", href: "/trustees", icon: <BusinessIcon /> },
  { label: "계약 관리", href: "/contracts", icon: <DescriptionIcon /> },
  { label: "점검 관리", href: "/inspections", icon: <AssignmentIcon /> },
];

<Layout navItems={navItems} onNavigate={(href) => router.push(href)}>
  {children}
</Layout>
```

## 페이지 구조 패턴

### 목록 페이지 (`page.tsx`)
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import { DataTable, Button } from "@trustee/ui";
import { useTrustees } from "@/hooks";

export default function TrusteesPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useTrustees({
    page: page + 1,
    limit: rowsPerPage,
    search: search || undefined,
  });

  if (isLoading) return <div>로딩 중...</div>;

  return (
    <>
      <Typography variant="h5" gutterBottom>수탁사 관리</Typography>
      <Button variant="contained" onClick={() => router.push("/trustees/new")}>
        수탁사 등록
      </Button>
      <DataTable columns={columns} rows={data?.data ?? []} ... />
    </>
  );
}
```

### 생성/수정 페이지 (React Hook Form + Zod)
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormTextField, Button } from "@trustee/ui";
import { useCreateTrustee } from "@/hooks";

const schema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().min(1, "사업자번호는 필수입니다"),
  // ...
});

type FormData = z.infer<typeof schema>;

export default function NewTrusteePage() {
  const router = useRouter();
  const { mutate, isPending } = useCreateTrustee();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    mutate(data, {
      onSuccess: () => router.push("/trustees"),
    });
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <FormTextField label="회사명" {...register("companyName")} error={errors.companyName?.message} />
      <Button type="submit" variant="contained" loading={isPending}>등록</Button>
    </Form>
  );
}
```

## 공유 타입 import
```typescript
import type { Trustee, Contract, Inspection, InspectionItem } from "@trustee/types";
import type { CreateTrusteeInput, UpdateTrusteeInput } from "@trustee/types";
```

## UI import
```typescript
// @trustee/ui 공유 컴포넌트
import { Button, DataTable, Dialog, Form, FormTextField, FormSelect, Layout } from "@trustee/ui";

// MUI 직접 import (공유 컴포넌트에 없는 것)
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
```

## 스타일링 우선순위
1. `@trustee/ui` 공유 컴포넌트 우선 사용
2. MUI 컴포넌트 + `sx` prop
3. Tailwind CSS (`className`)
4. `sx`와 `className` 혼용 가능

## 네이밍
- 페이지 컴포넌트: `export default function TrusteesPage()`
- 커스텀 훅: `use` 접두사 (`useTrustees`, `useCreateTrustee`)
- 이벤트 핸들러: `handle` 접두사 (`handleSubmit`, `handleDelete`)
- API 객체: `{resource}Api` (`trusteesApi`)
- 쿼리 키: `{RESOURCE}_KEY` (`TRUSTEES_KEY`)

## 파일 네이밍
- 페이지: `page.tsx` (Next.js 규칙)
- 레이아웃: `layout.tsx`
- 로딩: `loading.tsx`
- 에러: `error.tsx`
- 훅: `use{Resource}.ts` (`useTrustees.ts`)
- API: `{resource}.ts` (`trustees.ts`)
- 컴포넌트: `PascalCase.tsx` (`StatCard.tsx`)

## Date 직렬화
Date 객체는 API 전송 시 ISO 문자열로 변환:
```typescript
startDate instanceof Date ? startDate.toISOString() : startDate
```

## UI 언어
- 모든 UI 텍스트는 한국어
- 코드(변수명, 함수명 등)는 영어
