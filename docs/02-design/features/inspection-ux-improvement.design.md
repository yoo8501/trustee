# Design: 점검 관리 페이지 UX 개선

> Plan 문서: `docs/01-plan/features/inspection-ux-improvement.plan.md`

## 1. 구현 순서

```
Phase 1: 버그 수정 (P0)
  1-1. ScorePanel N/A 퍼센트 버그 수정
  1-2. MUI Select warning 수정

Phase 2: 백엔드 API 확장
  2-1. 체크리스트 목록 API에 search 파라미터 추가
  2-2. 체크리스트 목록/최근제출 API 응답에 trusteeName 추가

Phase 3: 메인 페이지 개선 (P1/P2)
  3-1. 최근 제출 테이블 개선 (페이지네이션 제거 + 수탁사명)
  3-2. 빠른 이동 카드 위치/스타일 개선
  3-3. 통계 카드에 부가 정보 추가
  3-4. 빈 상태 UI

Phase 4: 체크리스트 목록 개선 (P1)
  4-1. 수탁사명 컬럼 추가 + 컬럼 정리
  4-2. 검색 기능 추가
  4-3. 빈 상태 UI

Phase 5: 체크리스트 상세 개선 (P1/P3)
  5-1. 상단 정보 영역 통합 (ChecklistInfoCard)
  5-2. 카테고리 아코디언 기본 접힘
  5-3. 컴포넌트 분리

Phase 6: 템플릿 페이지 개선 (P2)
  6-1. 템플릿 생성 파일 업로드
  6-2. 빈 상태 UI
```

---

## 2. 상세 설계

### 2-1. Phase 1: 버그 수정

#### 1-1. ScorePanel N/A 퍼센트 버그 수정

**파일**: `frontend/web/src/components/ScorePanel.tsx`

**원인**: N/A 퍼센트를 `100 - yesPercent - noPercent`로 계산하고 있어, `Math.round` 반올림으로 인해 음수가 될 수 있다.

**현재 코드** (line 24-26):
```typescript
const yesPercent = Math.round((distribution.yes / distribution.total) * 100);
const noPercent = Math.round((distribution.no / distribution.total) * 100);
const naPercent = 100 - yesPercent - noPercent;
```

**수정 방안**: N/A 퍼센트도 직접 계산하되 합이 100%를 넘지 않도록 보정한다.

```typescript
const yesPercent = Math.round((distribution.yes / distribution.total) * 100);
const noPercent = Math.round((distribution.no / distribution.total) * 100);
const naPercent = Math.max(0, Math.round((distribution.na / distribution.total) * 100));
```

#### 1-2. MUI Select out-of-range Warning 수정

**파일**: `frontend/web/src/app/(dashboard)/inspections/checklists/page.tsx`

**원인**: `FormSelect`에 빈 문자열 `""` 값이 전달되는데, 드롭다운 options에 빈 값이 `value: ""`로 정의되어 있어도 MUI Select가 경고를 발생시킬 수 있다. FormSelect의 내부 구현을 확인하여 적절히 처리한다.

**수정 방안**: `statusFilter`의 초기값을 `"all"`로 변경하고 options 매핑도 수정한다.

```typescript
// Before
const [statusFilter, setStatusFilter] = useState<string>("");
const statusOptions = [
  { value: "", label: "전체" },
  ...
];

// After
const [statusFilter, setStatusFilter] = useState<string>("all");
const statusOptions = [
  { value: "all", label: "전체" },
  ...
];

// API 호출 시
const { data, isLoading } = useTrusteeChecklists({
  ...
  status: statusFilter === "all" ? undefined : statusFilter,
});
```

---

### 2-2. Phase 2: 백엔드 API 확장

#### 2-1. 체크리스트 목록 API에 search 파라미터 추가

**파일 변경**:
- `backend/services/inspection/src/services/trustee-checklist.service.ts`
- `backend/services/inspection/src/repositories/trustee-checklist.repository.ts`
- `backend/services/inspection/src/controllers/trustee-checklist.controller.ts`
- `frontend/web/src/lib/api/trustee-checklists.ts`
- `frontend/web/src/hooks/useTrusteeChecklists.ts`

**Service 변경**:
```typescript
interface ListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
  search?: string;  // 추가
}

async list(params: ListParams) {
  const where: Record<string, unknown> = {};
  if (params.trusteeId) where.trusteeId = params.trusteeId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { title: { contains: params.search } },
      { contactName: { contains: params.search } },
    ];
  }
  return this.repository.findAll({ skip, take: limit, where });
}
```

**Controller 변경**:
```typescript
list = async (req: Request, res: Response, next: NextFunction) => {
  const { page, limit, trusteeId, status, search } = req.query;
  const result = await this.service.list({
    ...
    search: search as string,
  });
  res.json({ data: result.data, total: result.total });
};
```

**프론트엔드 API 클라이언트**:
```typescript
interface ChecklistListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
  search?: string;  // 추가
}
```

**프론트엔드 훅**:
```typescript
export function useTrusteeChecklists(params?: {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
  search?: string;  // 추가
}) { ... }
```

#### 2-2. 체크리스트 응답에 trusteeName 추가

**방식**: 프론트엔드 클라이언트 조인 (가장 적은 변경)

마이크로서비스 간 DB 분리로 inspection 서비스에서 직접 JOIN 불가. Gateway 집계를 하면 복잡도가 높고, DB 비정규화는 이벤트 동기화 부담이 있다. 가장 현실적인 방식은 **프론트엔드에서 수탁사 목록을 캐싱하고 매핑**하는 것이다.

**새 유틸리티 훅** (`frontend/web/src/hooks/useTrusteeMap.ts`):
```typescript
"use client";

import { useMemo } from "react";
import { useTrustees } from "@/hooks";

export function useTrusteeMap() {
  const { data } = useTrustees({ limit: 500 });

  const trusteeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of data?.data ?? []) {
      map.set(t.id, t.companyName);
    }
    return map;
  }, [data]);

  return trusteeMap;
}
```

이 훅을 체크리스트 목록, 메인 페이지에서 사용하여 `trusteeId` → `companyName` 매핑.

---

### 2-3. Phase 3: 메인 페이지 개선

**파일**: `frontend/web/src/app/(dashboard)/inspections/page.tsx`

#### 3-1. 최근 제출 테이블 개선

**변경사항**:
- `DataTable`의 `onPageChange`에 `undefined` 전달하여 페이지네이션 숨김 (DataTable은 `onPageChange`가 falsy면 pagination을 렌더링하지 않음)
- 수탁사명 컬럼 추가 (`useTrusteeMap` 활용)

```tsx
// 페이지네이션 제거
<DataTable
  columns={recentColumns}
  rows={recentItems}
  getRowKey={(row) => row.id}
  onRowClick={(row) => router.push(`/inspections/checklists/${row.id}`)}
/>

// 수탁사명 컬럼 추가
const trusteeMap = useTrusteeMap();

const recentColumns: Column<RecentItem>[] = [
  { id: "title", label: "제목", minWidth: 200 },
  {
    id: "trusteeName",
    label: "수탁사",
    minWidth: 120,
    render: (row) => trusteeMap.get(row.trusteeId) || "-",
  },
  // ... 기존 컬럼
];
```

#### 3-2. 빠른 이동 카드 위치/스타일 개선

통계 카드 바로 아래로 이동하고, 더 눈에 띄는 스타일로 변경한다.

**레이아웃 변경** (현재: 통계 → 테이블 → 카드):
```
개선 후: 통계 → 빠른 이동 카드 → 최근 제출 테이블
```

카드 스타일 개선:
```tsx
<Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}>
  <Card
    sx={{
      borderLeft: 4,
      borderColor: "primary.main",
      "&:hover": { bgcolor: "action.hover" },
    }}
  >
    <CardActionArea onClick={() => router.push("/inspections/templates")}>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
        <ListAltIcon sx={{ fontSize: 32, color: "primary.main" }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>체크리스트 템플릿</Typography>
          <Typography variant="body2" color="text.secondary">
            Root 템플릿을 관리합니다
          </Typography>
        </Box>
      </CardContent>
    </CardActionArea>
  </Card>
  {/* 수탁사 체크리스트 카드도 동일 패턴 */}
</Box>
```

#### 3-3. 통계 카드에 부가 정보 추가

현재 stats API가 `{ total, submitted, reviewed, averageScore }`를 반환한다.
추가 통계 없이 기존 데이터를 더 의미 있게 표시:

- "총 체크리스트" → "전체 N건" (기존)
- "제출완료" → "제출완료 N건" + 부가텍스트 "검토 필요"
- "검토완료" → "검토완료 N건"
- "평균 점수" → "평균 N점" + GradeBadge

```tsx
<StatCard
  label="제출완료"
  value={stats?.submitted ?? 0}
  icon={<CheckCircleIcon />}
  subtitle={stats?.submitted ? "검토 필요" : undefined}
/>
```

> **참고**: `StatCard`에 `subtitle` prop이 없으면 별도 래핑으로 처리한다.

#### 3-4. 빈 상태 UI

최근 제출 체크리스트가 없을 때 현재는 섹션 자체가 숨겨진다.
대신 안내 메시지를 표시:

```tsx
{recentItems.length === 0 ? (
  <Paper variant="outlined" sx={{ p: 4, textAlign: "center", mb: 3 }}>
    <AssignmentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
    <Typography variant="body1" color="text.secondary" gutterBottom>
      아직 제출된 체크리스트가 없습니다
    </Typography>
    <Typography variant="body2" color="text.disabled">
      수탁사 체크리스트를 생성하고 수탁사에게 전달하세요
    </Typography>
    <Button
      variant="contained"
      sx={{ mt: 2 }}
      onClick={() => router.push("/inspections/checklists/new")}
    >
      체크리스트 생성
    </Button>
  </Paper>
) : (
  // 기존 테이블
)}
```

---

### 2-4. Phase 4: 체크리스트 목록 개선

**파일**: `frontend/web/src/app/(dashboard)/inspections/checklists/page.tsx`

#### 4-1. 수탁사명 컬럼 추가 + 컬럼 정리

**컬럼 변경표**:

| 기존 컬럼 | 변경 | 이유 |
|-----------|------|------|
| No. | 유지 | |
| 제목 | 유지 | |
| **(신규) 수탁사** | **추가** | 핵심 정보 |
| 상태 | 유지 | |
| 점수/등급 | 유지 | |
| 작성자 | 유지 | |
| 작성 기한 | 유지 | |
| ~~제출~~ | **제거** | 상세에서 확인 가능 |
| ~~생성일~~ | **제거** | 제출일이 더 중요 |
| 제출일 | 유지 | |

결과: 9개 → 8개 컬럼 (수탁사 추가, 제출횟수/생성일 제거)

```tsx
const trusteeMap = useTrusteeMap();

const columns: Column<TrusteeChecklist>[] = [
  { id: "no", label: "No.", minWidth: 50, align: "center",
    render: (_row, index) => page * rowsPerPage + index + 1 },
  { id: "title", label: "제목", minWidth: 200 },
  {
    id: "trusteeName",
    label: "수탁사",
    minWidth: 120,
    render: (row) => trusteeMap.get(row.trusteeId) || "-",
  },
  { id: "status", label: "상태", minWidth: 100,
    render: (row) => <InspectionStatusChip status={row.status as InspectionStatus} /> },
  { id: "totalScore", label: "점수/등급", minWidth: 140,
    render: (row) => { /* 기존 로직 */ } },
  { id: "contactName", label: "작성자", minWidth: 100,
    render: (row) => row.contactName || "-" },
  { id: "accessTokenExpiresAt", label: "작성 기한", minWidth: 100,
    render: (row) => { /* 기존 D-day 로직 */ } },
  { id: "submittedAt", label: "제출일", minWidth: 120,
    render: (row) => row.submittedAt ? new Date(row.submittedAt).toLocaleDateString("ko-KR") : "-" },
];
```

#### 4-2. 검색 기능 추가

상태 필터 옆에 텍스트 검색 필드 추가. Debounce 300ms.

```tsx
const [search, setSearch] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");

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
```

**필터 영역 UI**:
```tsx
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
```

#### 4-3. 빈 상태 UI

DataTable 컴포넌트가 이미 빈 상태를 "데이터가 없습니다"로 처리한다.
검색/필터 결과가 없을 때는 더 구체적인 메시지 표시:

```tsx
{!isLoading && (data?.data ?? []).length === 0 && (debouncedSearch || statusFilter !== "all") && (
  <Box sx={{ textAlign: "center", py: 4 }}>
    <Typography variant="body2" color="text.secondary">
      검색 조건에 맞는 체크리스트가 없습니다
    </Typography>
  </Box>
)}
```

---

### 2-5. Phase 5: 체크리스트 상세 개선

**파일**: `frontend/web/src/app/(dashboard)/inspections/checklists/[id]/page.tsx`

#### 5-1. 상단 정보 영역 통합 (ChecklistInfoCard)

현재 3개의 `Paper`로 분산된 정보(토큰 링크, 기한, 작성자)를 하나의 카드로 통합한다.

**새 컴포넌트**: `frontend/web/src/components/ChecklistInfoCard.tsx`

```tsx
interface ChecklistInfoCardProps {
  tokenUrl: string;
  deadline: string | null;
  isExpired: boolean;
  daysLeft: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  submittedAt?: string | null;
  submissionCount: number;
  status: string;
  onCopyLink: () => void;
  onRegenerate: () => void;
  onDeadlineEdit: () => void;
  copied: boolean;
  isRegenerating: boolean;
}
```

**레이아웃**:
```
┌─────────────────────────────────────────────────┐
│ 수탁사 작성 링크                     [재발급]    │
│ [🔗 http://...token...]              [📋 복사]   │
├─────────────────────────────────────────────────┤
│ 📅 작성 기한: 2026.02.21 [만료됨]   [기한 변경]  │
├─────────────────────────────────────────────────┤
│ 👤 sjseo  📧 email@...  📱 1234  제출 4회       │
│                            제출일: 2026.02.20    │
└─────────────────────────────────────────────────┘
```

3개의 Paper → 1개의 Paper + Divider로 통합.

#### 5-2. 카테고리 아코디언 기본 접힘

**변경** (line 856):
```tsx
// Before
<Accordion key={category.id} defaultExpanded>

// After
<Accordion key={category.id} defaultExpanded={false}>
```

섹션 아코디언은 이미 `defaultExpanded={false}`이므로 변경 불필요.

#### 5-3. 컴포넌트 분리

현재 1100줄의 단일 파일을 다음과 같이 분리:

| 새 컴포넌트 | 줄 수 (예상) | 역할 |
|-------------|-------------|------|
| `ChecklistInfoCard.tsx` | ~100줄 | 토큰, 기한, 작성자 통합 카드 |
| `ChecklistCategoryView.tsx` | ~150줄 | 카테고리/섹션/항목 아코디언 |
| `ChecklistActionDialogs.tsx` | ~200줄 | 검토/반려/기한변경/재발급 다이얼로그 |
| `[id]/page.tsx` (리팩토링) | ~350줄 | 메인 레이아웃 + 상태 관리 |

**이동 대상**:
- `FilePreviewDialog` → `ChecklistCategoryView.tsx` 내부
- `EvidenceFileList` → `ChecklistCategoryView.tsx` 내부
- `RejectItemRow`, `RejectDialogContent` → `ChecklistActionDialogs.tsx`

---

### 2-6. Phase 6: 템플릿 페이지 개선

**파일**: `frontend/web/src/app/(dashboard)/inspections/templates/new/page.tsx`

#### 6-1. 템플릿 생성 파일 업로드

기존 JSON 텍스트 입력 위에 파일 업로드 영역을 추가한다.

```tsx
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    setJsonText(text);
  };
  reader.readAsText(file);
};
```

**UI**:
```tsx
<Paper
  variant="outlined"
  sx={{
    p: 3,
    mb: 2,
    textAlign: "center",
    border: "2px dashed",
    borderColor: "divider",
    cursor: "pointer",
    "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
  }}
  component="label"
>
  <UploadFileIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
  <Typography variant="body2" color="text.secondary">
    JSON 파일을 드래그하거나 클릭하여 업로드하세요
  </Typography>
  <Typography variant="caption" color="text.disabled">
    .json 파일만 지원됩니다
  </Typography>
  <input
    type="file"
    accept=".json,application/json"
    hidden
    onChange={handleFileUpload}
  />
</Paper>
```

#### 6-2. 빈 상태 UI

DataTable 컴포넌트가 이미 "데이터가 없습니다"를 표시하므로, 추가로 템플릿 생성 안내 버튼만 보이도록 한다. DataTable의 빈 상태 메시지로 충분하다면 추가 작업 불필요.

---

## 3. 파일 변경 목록

### 수정 파일

| 파일 | Phase | 변경 내용 |
|------|-------|-----------|
| `frontend/web/src/components/ScorePanel.tsx` | 1 | N/A 퍼센트 버그 수정 |
| `frontend/web/src/app/(dashboard)/inspections/checklists/page.tsx` | 1,4 | MUI warning 수정 + 검색 + 컬럼 정리 |
| `frontend/web/src/app/(dashboard)/inspections/page.tsx` | 3 | 레이아웃 개선 + 수탁사명 + 빈 상태 |
| `frontend/web/src/app/(dashboard)/inspections/checklists/[id]/page.tsx` | 5 | 정보 통합 + 아코디언 접힘 + 분리 |
| `frontend/web/src/app/(dashboard)/inspections/templates/new/page.tsx` | 6 | 파일 업로드 추가 |
| `backend/services/inspection/src/services/trustee-checklist.service.ts` | 2 | search 파라미터 추가 |
| `backend/services/inspection/src/repositories/trustee-checklist.repository.ts` | 2 | where 조건 확장 (search) |
| `backend/services/inspection/src/controllers/trustee-checklist.controller.ts` | 2 | search query 파라미터 추출 |
| `frontend/web/src/lib/api/trustee-checklists.ts` | 2 | search 파라미터 추가 |
| `frontend/web/src/hooks/useTrusteeChecklists.ts` | 2 | search 파라미터 추가 |

### 새 파일

| 파일 | Phase | 설명 |
|------|-------|------|
| `frontend/web/src/hooks/useTrusteeMap.ts` | 2 | trusteeId → companyName 매핑 훅 |
| `frontend/web/src/components/ChecklistInfoCard.tsx` | 5 | 통합 정보 카드 |
| `frontend/web/src/components/ChecklistCategoryView.tsx` | 5 | 카테고리/항목 뷰 (파일 미리보기 포함) |
| `frontend/web/src/components/ChecklistActionDialogs.tsx` | 5 | 반려/검토/재발급/기한변경 다이얼로그 |

---

## 4. 의존성

### 추가 패키지
- 없음 (기존 MUI, React Hook Form 활용)

### API 의존성
- Phase 2 완료 후 Phase 3, 4 진행 가능
- Phase 1 (버그 수정)은 독립적으로 즉시 가능
- Phase 5, 6은 독립적으로 진행 가능

---

## 5. 테스트 포인트

| 항목 | 검증 방법 |
|------|-----------|
| N/A 퍼센트 버그 | ScorePanel에서 na=0, total=80 일 때 0% 표시 확인 |
| MUI 경고 제거 | 브라우저 콘솔에서 "out-of-range" 경고 0건 확인 |
| 수탁사명 표시 | 체크리스트 목록/메인에서 수탁사 회사명 표시 확인 |
| 검색 기능 | 제목/작성자명으로 검색 시 필터링 동작 확인 |
| 빈 상태 | 데이터 없을 때 안내 메시지 + CTA 버튼 표시 확인 |
| 정보 통합 | 상세 페이지 상단에 링크/기한/작성자 하나의 카드로 표시 확인 |
| 아코디언 접힘 | 상세 진입 시 카테고리 아코디언이 접힌 상태 확인 |
| 파일 업로드 | JSON 파일 드래그/클릭 업로드 후 텍스트 영역에 반영 확인 |
| 컬럼 정리 | 체크리스트 목록에서 8개 컬럼 표시 확인 |
