# 점검 시스템 고도화 - 디자인 시스템 가이드

## 개요

기존 `@trustee/ui` 컴포넌트 시스템을 기반으로, 점검 시스템 고도화에 필요한 신규 컴포넌트 및 토큰 확장을 정의합니다.

---

## 1. 색상 토큰 확장

### 1-1. 점검 등급 색상 (inspection grade colors)

`frontend/packages/ui/src/theme/tokens.ts`에 추가:

```typescript
export const inspectionColors = {
  grade: {
    // A+ (95-100점)
    aPlus: {
      bg: "#27a64418",
      border: "#27a64433",
      text: "#27a644",
      label: "A+",
    },
    // A (90-94점)
    a: {
      bg: "#4ea7fc18",
      border: "#4ea7fc33",
      text: "#4ea7fc",
      label: "A",
    },
    // B+ (80-89점)
    bPlus: {
      bg: "#00b8cc18",
      border: "#00b8cc33",
      text: "#00b8cc",
      label: "B+",
    },
    // B (70-79점)
    b: {
      bg: "#f0bf0018",
      border: "#f0bf0033",
      text: "#f0bf00",
      label: "B",
    },
    // C (60-69점)
    c: {
      bg: "#fc784018",
      border: "#fc784033",
      text: "#fc7840",
      label: "C",
    },
    // D (60점 미만)
    d: {
      bg: "#eb575718",
      border: "#eb575733",
      text: "#eb5757",
      label: "D",
    },
  },

  answer: {
    // 적합 (예)
    yes: {
      bg: "#27a64412",
      border: "#27a644",
      text: "#27a644",
    },
    // 미흡 (아니오)
    no: {
      bg: "#fc784012",
      border: "#fc7840",
      text: "#fc7840",
    },
    // 해당없음 (N/A)
    na: {
      bg: "#62666d12",
      border: "#62666d",
      text: "#62666d",
    },
  },

  status: {
    draft:       { bg: "#62666d18", text: "#8a8f98", label: "초안" },
    sent:        { bg: "#4ea7fc18", text: "#4ea7fc", label: "전달됨" },
    in_progress: { bg: "#f0bf0018", text: "#f0bf00", label: "작성중" },
    submitted:   { bg: "#5e6ad218", text: "#7170ff", label: "제출완료" },
    reviewed:    { bg: "#27a64418", text: "#27a644", label: "검토완료" },
  },
} as const;
```

### 1-2. 점수 → 등급 변환 유틸리티

`frontend/web/src/lib/inspection-utils.ts`에 추가:

```typescript
import { inspectionColors } from "@trustee/ui";

export type InspectionGrade = "A+" | "A" | "B+" | "B" | "C" | "D";

export function scoreToGrade(score: number): InspectionGrade {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function getGradeColors(grade: InspectionGrade) {
  const keyMap: Record<InspectionGrade, keyof typeof inspectionColors.grade> = {
    "A+": "aPlus",
    "A": "a",
    "B+": "bPlus",
    "B": "b",
    "C": "c",
    "D": "d",
  };
  return inspectionColors.grade[keyMap[grade]];
}
```

---

## 2. 신규 컴포넌트 정의

### 2-1. GradeBadge

점검 등급을 색상 배지로 표시하는 컴포넌트.

**파일 위치**: `frontend/packages/ui/src/components/GradeBadge.tsx`

```tsx
"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { inspectionColors } from "../theme/tokens";
import type { InspectionGrade } from "./types";

export interface GradeBadgeProps {
  grade: InspectionGrade;
  size?: "sm" | "md" | "lg";
}

export function GradeBadge({ grade, size = "md" }: GradeBadgeProps) {
  const keyMap = { "A+": "aPlus", "A": "a", "B+": "bPlus", "B": "b", "C": "c", "D": "d" } as const;
  const colors = inspectionColors.grade[keyMap[grade]];

  const sizeMap = {
    sm: { px: 1, py: 0.25, fontSize: "0.6875rem" },
    md: { px: 1.25, py: 0.375, fontSize: "0.75rem" },
    lg: { px: 2, py: 0.75, fontSize: "0.9375rem" },
  };

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...sizeMap[size],
        borderRadius: "6px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        fontWeight: 600,
        color: colors.text,
        fontSize: sizeMap[size].fontSize,
        letterSpacing: "0.05em",
        minWidth: size === "lg" ? 48 : size === "md" ? 36 : 28,
      }}
    >
      {grade}
    </Box>
  );
}
```

**사용 예시**:
```tsx
import { GradeBadge } from "@trustee/ui";

<GradeBadge grade="B+" size="md" />
<GradeBadge grade="A+" size="lg" />
```

---

### 2-2. ScorePanel

종합 점수, 등급, 답변 분포를 표시하는 요약 패널.

**파일 위치**: `frontend/web/src/components/ScorePanel.tsx`

```tsx
"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import { GradeBadge } from "@trustee/ui";
import { colors } from "@trustee/ui";
import { scoreToGrade } from "@/lib/inspection-utils";

export interface AnswerDistribution {
  yes: number;    // 적합
  no: number;     // 미흡
  na: number;     // N/A
  total: number;  // 전체
}

export interface ScorePanelProps {
  score: number;
  distribution: AnswerDistribution;
}

export function ScorePanel({ score, distribution }: ScorePanelProps) {
  const grade = scoreToGrade(score);
  const yesPercent = Math.round((distribution.yes / distribution.total) * 100);
  const noPercent = Math.round((distribution.no / distribution.total) * 100);
  const naPercent = 100 - yesPercent - noPercent;

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      {/* 점수 및 등급 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h1" sx={{ fontWeight: 700, color: colors.fg.primary }}>
          {score}점
        </Typography>
        <GradeBadge grade={grade} size="lg" />
      </Box>

      {/* 답변 분포 */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#27a644" }}>
            적합 {yesPercent}% ({distribution.yes}건)
          </Typography>
          <Typography variant="caption" sx={{ color: "#fc7840" }}>
            미흡 {noPercent}% ({distribution.no}건)
          </Typography>
          <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
            N/A {naPercent}% ({distribution.na}건)
          </Typography>
        </Box>
        {/* 스택형 프로그레스 바 */}
        <Box sx={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: "2px" }}>
          <Box sx={{ width: `${yesPercent}%`, bgcolor: "#27a644", borderRadius: "4px 0 0 4px" }} />
          <Box sx={{ width: `${noPercent}%`, bgcolor: "#fc7840" }} />
          <Box sx={{ flex: 1, bgcolor: colors.border.secondary, borderRadius: "0 4px 4px 0" }} />
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
        전체 {distribution.total}개 항목
      </Typography>
    </Paper>
  );
}
```

---

### 2-3. ChecklistProgressBar

체크리스트 목록에서 진행률을 표시하는 컴포넌트.

**파일 위치**: `frontend/web/src/components/ChecklistProgressBar.tsx`

```tsx
"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { colors } from "@trustee/ui";

export interface ChecklistProgressBarProps {
  completed: number;
  total: number;
}

export function ChecklistProgressBar({ completed, total }: ChecklistProgressBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
          {completed}/{total}
        </Typography>
        <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
          {percent}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.border.secondary,
          "& .MuiLinearProgress-bar": {
            backgroundColor: percent === 100 ? "#27a644" : "#5e6ad2",
            borderRadius: 3,
          },
        }}
      />
    </Box>
  );
}
```

---

### 2-4. InspectionRadarChart

카테고리별 점수를 레이더 차트로 표시하는 컴포넌트.

recharts 라이브러리를 사용합니다.

**설치 필요**:
```bash
pnpm add recharts --filter @trustee/web
```

**파일 위치**: `frontend/web/src/components/InspectionRadarChart.tsx`

```tsx
"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { colors } from "@trustee/ui";

export interface RadarDataPoint {
  category: string;
  current: number;   // 이번 점검 점수
  previous?: number; // 이전 점검 점수 (선택)
}

export interface InspectionRadarChartProps {
  data: RadarDataPoint[];
  showPrevious?: boolean;
}

export function InspectionRadarChart({ data, showPrevious = false }: InspectionRadarChartProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 2, color: colors.fg.secondary }}>
        카테고리별 점수
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke={colors.border.secondary} />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: colors.fg.tertiary, fontSize: 12 }}
          />
          {showPrevious && (
            <Radar
              name="이전 점검"
              dataKey="previous"
              stroke={colors.fg.quaternary}
              fill={colors.fg.quaternary}
              fillOpacity={0.1}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="이번 점검"
            dataKey="current"
            stroke="#5e6ad2"
            fill="#5e6ad2"
            fillOpacity={0.25}
          />
          <Legend
            wrapperStyle={{ color: colors.fg.tertiary, fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </Paper>
  );
}
```

---

### 2-5. InspectionStatusChip

체크리스트 상태를 색상 Chip으로 표시하는 컴포넌트.
기존 코드에 분산된 statusColorMap, statusLabelMap을 통합합니다.

**파일 위치**: `frontend/web/src/components/InspectionStatusChip.tsx`

```tsx
"use client";

import Chip from "@mui/material/Chip";
import { inspectionColors } from "@trustee/ui";

export type InspectionStatus = "draft" | "sent" | "in_progress" | "submitted" | "reviewed";

const MUI_COLOR_MAP: Record<InspectionStatus, "default" | "info" | "warning" | "primary" | "success"> = {
  draft:       "default",
  sent:        "info",
  in_progress: "warning",
  submitted:   "primary",
  reviewed:    "success",
};

export interface InspectionStatusChipProps {
  status: InspectionStatus;
  size?: "small" | "medium";
}

export function InspectionStatusChip({ status, size = "small" }: InspectionStatusChipProps) {
  const label = inspectionColors.status[status]?.label ?? status;
  const color = MUI_COLOR_MAP[status] ?? "default";

  return <Chip label={label} color={color} size={size} />;
}
```

---

### 2-6. AnswerRadioGroup

체크리스트 입력 화면에서 답변을 선택하는 라디오 그룹 컴포넌트.

**파일 위치**: `frontend/web/src/components/AnswerRadioGroup.tsx`

```tsx
"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

export type AnswerValue = "yes" | "no" | "not_applicable";

export interface AnswerRadioGroupProps {
  value: AnswerValue | null;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}

const ANSWER_OPTIONS: { value: AnswerValue; label: string; color: string }[] = [
  { value: "yes",            label: "예",   color: "#27a644" },
  { value: "no",             label: "아니오", color: "#fc7840" },
  { value: "not_applicable", label: "N/A",  color: "#62666d" },
];

export function AnswerRadioGroup({ value, onChange, disabled }: AnswerRadioGroupProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_e, newValue) => {
        if (newValue !== null) onChange(newValue);
      }}
      size="small"
      disabled={disabled}
    >
      {ANSWER_OPTIONS.map((opt) => (
        <ToggleButton
          key={opt.value}
          value={opt.value}
          sx={{
            px: 2,
            fontSize: "0.75rem",
            "&.Mui-selected": {
              backgroundColor: `${opt.color}20`,
              borderColor: opt.color,
              color: opt.color,
              fontWeight: 600,
              "&:hover": { backgroundColor: `${opt.color}30` },
            },
          }}
        >
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
```

---

### 2-7. ChecklistItemCard

체크리스트 입력 화면에서 각 항목을 표시하는 카드 컴포넌트.

**파일 위치**: `frontend/web/src/components/ChecklistItemCard.tsx`

```tsx
"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import { colors } from "@trustee/ui";
import { AnswerRadioGroup, type AnswerValue } from "./AnswerRadioGroup";

export interface ChecklistItemCardProps {
  no: string;
  question: string;
  applicable: boolean;
  answer: AnswerValue | null;
  currentStatus: string;
  remarks: string;
  evidenceFiles: { id: string; fileName: string }[];
  saveStatus: "idle" | "saving" | "saved" | "error";
  onAnswerChange: (value: AnswerValue) => void;
  onApplicableChange: (value: boolean) => void;
  onCurrentStatusChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onFileAdd: (files: File[]) => void;
  onFileRemove: (fileId: string) => void;
  readOnly?: boolean;
}

export function ChecklistItemCard({
  no,
  question,
  applicable,
  answer,
  currentStatus,
  remarks,
  evidenceFiles,
  saveStatus,
  onAnswerChange,
  onApplicableChange,
  onCurrentStatusChange,
  onRemarksChange,
  onFileAdd,
  onFileRemove,
  readOnly = false,
}: ChecklistItemCardProps) {
  // 답변에 따른 왼쪽 보더 색상
  const borderColor =
    answer === "yes"
      ? "#27a644"
      : answer === "no"
        ? "#fc7840"
        : answer === "not_applicable"
          ? colors.fg.quaternary
          : colors.border.secondary;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1.5,
        borderLeft: `3px solid ${borderColor}`,
        transition: "border-color 0.2s",
        bgcolor: applicable === false ? colors.bg.tint : "transparent",
      }}
    >
      <Box sx={{ p: 2 }}>
        {/* 항목 번호 + 질문 */}
        <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
          <Chip label={no} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: colors.fg.primary, fontWeight: 500 }}>
            {question}
          </Typography>
        </Box>

        {/* 대상여부 + 답변 */}
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: colors.fg.tertiary, display: "block", mb: 0.5 }}>
              대상여부
            </Typography>
            {/* 대상여부 토글 - 생략, ToggleButtonGroup으로 구현 */}
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: colors.fg.tertiary, display: "block", mb: 0.5 }}>
              답변
            </Typography>
            <AnswerRadioGroup
              value={answer}
              onChange={onAnswerChange}
              disabled={readOnly || !applicable}
            />
          </Box>
        </Box>

        {/* 현황 입력 */}
        {applicable && (
          <TextField
            fullWidth
            size="small"
            label="현황"
            value={currentStatus}
            onChange={(e) => onCurrentStatusChange(e.target.value)}
            placeholder="현재 이행 현황을 입력하세요"
            multiline
            rows={2}
            sx={{ mb: 1.5 }}
            disabled={readOnly}
          />
        )}

        {/* 파일 첨부 영역 - 생략, 별도 FileUploadZone 컴포넌트로 구현 */}

        {/* 비고 */}
        <TextField
          fullWidth
          size="small"
          label="비고"
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          disabled={readOnly}
        />

        {/* 저장 상태 */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Typography
            variant="caption"
            sx={{
              color:
                saveStatus === "saved"  ? "#27a644"
                : saveStatus === "saving" ? colors.fg.tertiary
                : saveStatus === "error"  ? "#eb5757"
                : colors.fg.quaternary,
            }}
          >
            {saveStatus === "saving" && "저장 중..."}
            {saveStatus === "saved"  && "✓ 저장됨"}
            {saveStatus === "error"  && "✗ 저장 실패"}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
```

---

## 3. 레이아웃 패턴

### 3-1. 상세 페이지 2컬럼 레이아웃

점수 패널과 차트를 나란히 배치하는 패턴:

```tsx
<Box
  sx={{
    display: "grid",
    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
    gap: 3,
    mb: 3,
  }}
>
  <ScorePanel score={82} distribution={distribution} />
  <InspectionRadarChart data={radarData} showPrevious />
</Box>
```

### 3-2. 체크리스트 입력 페이지 레이아웃

전체 진행률 고정 헤더 + 스크롤 가능한 아코디언:

```tsx
<Box sx={{ minHeight: "100vh", bgcolor: colors.bg.primary }}>
  {/* 고정 상단 진행률 바 */}
  <Box sx={{ position: "sticky", top: 0, zIndex: 100, bgcolor: colors.bg.secondary, p: 2, borderBottom: `1px solid ${colors.border.primary}` }}>
    <ChecklistProgressBar completed={completed} total={total} />
  </Box>

  {/* 스크롤 가능한 내용 */}
  <Box sx={{ p: 3, maxWidth: 900, mx: "auto" }}>
    {/* 카테고리 아코디언 목록 */}
  </Box>

  {/* 고정 하단 액션 버튼 */}
  <Box sx={{ position: "sticky", bottom: 0, bgcolor: colors.bg.secondary, p: 2, borderTop: `1px solid ${colors.border.primary}` }}>
    <Button variant="outlined">임시저장</Button>
    <Button variant="contained">최종 제출</Button>
  </Box>
</Box>
```

---

## 4. @trustee/ui 인덱스 파일 업데이트

신규 컴포넌트 추가 시 `frontend/packages/ui/src/index.ts`에 export 추가:

```typescript
// 기존 export 유지
export { GradeBadge, type GradeBadgeProps } from "./components/GradeBadge";
```

`inspectionColors`는 tokens.ts에 추가 후 index.ts에서 export:

```typescript
export { colors, typography, radius, shadows, spacing, animation, focusRing, inspectionColors } from "./theme/tokens";
```

---

## 5. 외부 라이브러리 의존성

| 라이브러리 | 용도 | 설치 위치 |
|-----------|------|---------|
| `recharts` | 레이더 차트, 파이차트 | `@trustee/web` |

```bash
pnpm add recharts --filter @trustee/web
pnpm add --save-dev @types/recharts --filter @trustee/web
```

> recharts는 자체 타입 정의를 포함하므로 `@types/recharts`는 불필요할 수 있습니다. 설치 후 확인하세요.

---

## 6. 컴포넌트 적용 우선순위

구현 시 아래 순서대로 적용을 권장합니다:

1. **tokens.ts 확장** (`inspectionColors` 추가) - 다른 모든 컴포넌트의 기반
2. **GradeBadge** - 목록 및 상세 페이지 공통 사용
3. **InspectionStatusChip** - 기존 중복 코드 대체
4. **ChecklistProgressBar** - 목록 페이지 진행률 표시
5. **ScorePanel** - 상세 페이지 점수 요약
6. **InspectionRadarChart** - 상세 페이지 시각화 (recharts 설치 선행)
7. **AnswerRadioGroup + ChecklistItemCard** - 체크리스트 입력 화면

---

## 7. 접근성 (Accessibility)

- 모든 인터랙티브 요소에 `aria-label` 또는 `aria-describedby` 적용
- 색상만으로 상태를 구분하지 않고 텍스트 레이블 병행 사용
- 레이더 차트 등 비텍스트 정보는 `aria-label`로 데이터 요약 제공
- 체크리스트 답변 선택은 키보드로도 조작 가능하도록 ToggleButtonGroup 사용
