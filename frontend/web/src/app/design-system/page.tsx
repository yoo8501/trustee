"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import BusinessIcon from "@mui/icons-material/Business";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import InboxIcon from "@mui/icons-material/Inbox";
import {
  Button,
  DataTable,
  Dialog,
  FormTextField,
  FormSelect,
  FormCheckbox,
  FormRadioGroup,
  Form,
  StatusBadge,
  SearchInput,
  EmptyState,
  PageHeader,
  StatCard,
  IconButton,
  Kbd,
  colors,
  type Column,
} from "@trustee/ui";

/* ─── Section wrapper ─── */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 6 }}>
      <Typography
        variant="overline"
        sx={{
          color: colors.fg.quaternary,
          mb: 2,
          display: "block",
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/* ─── Sample table data ─── */
interface SampleRow {
  id: string;
  companyName: string;
  businessNumber: string;
  status: string;
  contactName: string;
}

const sampleRows: SampleRow[] = [
  {
    id: "1",
    companyName: "(주)클라우드테크",
    businessNumber: "123-45-67890",
    status: "active",
    contactName: "김철수",
  },
  {
    id: "2",
    companyName: "(주)데이터솔루션",
    businessNumber: "234-56-78901",
    status: "pending",
    contactName: "이영희",
  },
  {
    id: "3",
    companyName: "보안시스템(주)",
    businessNumber: "345-67-89012",
    status: "inactive",
    contactName: "박민수",
  },
];

const columns: Column<SampleRow>[] = [
  { id: "companyName", label: "회사명", minWidth: 150 },
  { id: "businessNumber", label: "사업자번호", minWidth: 130 },
  {
    id: "status",
    label: "상태",
    render: (row) => (
      <StatusBadge status={row.status as "active" | "pending" | "inactive"} />
    ),
  },
  { id: "contactName", label: "담당자", minWidth: 100 },
];

/* ─── Page ─── */
export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <Box
      sx={{
        maxWidth: 960,
        mx: "auto",
        px: 4,
        py: 6,
      }}
    >
      <Box sx={{ mb: 6 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          Design System
        </Typography>
        <Typography variant="body1" sx={{ color: colors.fg.tertiary }}>
          Linear 테마 기반 컴포넌트 쇼케이스
        </Typography>
      </Box>

      <Divider sx={{ mb: 6 }} />

      {/* ─── Colors ─── */}
      <Section title="Colors">
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
          {(
            [
              ["Indigo", colors.brand.indigo],
              ["Accent", colors.brand.accent],
              ["Blue", colors.brand.blue],
              ["Green", colors.brand.green],
              ["Red", colors.brand.red],
              ["Orange", colors.brand.orange],
              ["Yellow", colors.brand.yellow],
              ["Teal", colors.brand.teal],
            ] as const
          ).map(([name, color]) => (
            <Box key={name} sx={{ textAlign: "center" }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "8px",
                  backgroundColor: color,
                  mb: 0.5,
                }}
              />
              <Typography variant="caption" sx={{ fontSize: "0.6875rem" }}>
                {name}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 3 }}>
          {(
            [
              ["BG Primary", colors.bg.primary],
              ["BG Level 1", colors.bg.level1],
              ["BG Level 2", colors.bg.level2],
              ["BG Level 3", colors.bg.level3],
              ["BG Tertiary", colors.bg.tertiary],
              ["BG Quaternary", colors.bg.quaternary],
            ] as const
          ).map(([name, color]) => (
            <Box key={name} sx={{ textAlign: "center" }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "8px",
                  backgroundColor: color,
                  border: `1px solid ${colors.border.primary}`,
                  mb: 0.5,
                }}
              />
              <Typography variant="caption" sx={{ fontSize: "0.6875rem" }}>
                {name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      {/* ─── Typography ─── */}
      <Section title="Typography">
        <Stack spacing={1.5}>
          <Typography variant="h1">h1 - 제목 타이틀</Typography>
          <Typography variant="h2">h2 - 섹션 제목</Typography>
          <Typography variant="h3">h3 - 서브 제목</Typography>
          <Typography variant="h4">h4 - 카드 제목</Typography>
          <Typography variant="body1">
            body1 - 본문 텍스트입니다. 일반적인 내용에 사용됩니다.
          </Typography>
          <Typography variant="body2" sx={{ color: colors.fg.secondary }}>
            body2 - 보조 텍스트입니다. 부가 정보에 사용됩니다.
          </Typography>
          <Typography variant="caption">caption - 캡션 텍스트</Typography>
          <Typography variant="overline">OVERLINE - 라벨 텍스트</Typography>
        </Stack>
      </Section>

      {/* ─── Buttons ─── */}
      <Section title="Button">
        <Stack spacing={2}>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="contained" size="small">
              Small
            </Button>
            <Button variant="contained" size="medium">
              Medium
            </Button>
            <Button variant="contained" size="large">
              Large
            </Button>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<AddIcon />}>
              등록
            </Button>
            <Button variant="outlined">취소</Button>
            <Button variant="text">텍스트</Button>
            <Button variant="contained" color="error">
              삭제
            </Button>
            <Button variant="contained" disabled>
              비활성
            </Button>
            <Button variant="contained" loading>
              로딩
            </Button>
          </Box>
        </Stack>
      </Section>

      {/* ─── IconButton ─── */}
      <Section title="IconButton">
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <IconButton tooltip="검색">
            <SearchIcon fontSize="small" />
          </IconButton>
          <IconButton tooltip="수정">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton tooltip="삭제">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </Section>

      {/* ─── StatusBadge ─── */}
      <Section title="StatusBadge">
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status="active" />
          <StatusBadge status="inactive" />
          <StatusBadge status="pending" />
          <StatusBadge status="error" />
          <StatusBadge status="warning" />
          <StatusBadge status="active" label="커스텀 라벨" />
          <StatusBadge status="active" size="sm" />
        </Box>
      </Section>

      {/* ─── Kbd ─── */}
      <Section title="Kbd (키보드 단축키)">
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <Typography variant="body2" sx={{ mx: 1, color: colors.fg.tertiary }}>
            검색
          </Typography>
          <Box sx={{ mx: 1 }} />
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>P</Kbd>
          <Typography variant="body2" sx={{ mx: 1, color: colors.fg.tertiary }}>
            커맨드 팔레트
          </Typography>
        </Box>
      </Section>

      {/* ─── SearchInput ─── */}
      <Section title="SearchInput">
        <Box sx={{ maxWidth: 320 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="수탁사 검색..."
          />
        </Box>
      </Section>

      {/* ─── PageHeader ─── */}
      <Section title="PageHeader">
        <Box
          sx={{
            border: `1px solid ${colors.border.primary}`,
            borderRadius: "12px",
            p: 3,
          }}
        >
          <PageHeader
            title="수탁사 관리"
            description="개인정보 처리 업무를 위탁받은 수탁사를 관리합니다."
            actions={
              <Button variant="contained" startIcon={<AddIcon />}>
                수탁사 등록
              </Button>
            }
          />
        </Box>
      </Section>

      {/* ─── StatCard ─── */}
      <Section title="StatCard">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 2,
          }}
        >
          <StatCard
            label="전체 수탁사"
            value={42}
            change="+3 이번 달"
            changeType="positive"
            icon={<BusinessIcon />}
          />
          <StatCard
            label="활성 계약"
            value={38}
            change="+5 이번 달"
            changeType="positive"
            icon={<TrendingUpIcon />}
          />
          <StatCard
            label="점검 예정"
            value={7}
            change="이번 주 마감"
            changeType="neutral"
          />
          <StatCard
            label="미이행 건수"
            value={2}
            change="-1 지난 달 대비"
            changeType="negative"
          />
        </Box>
      </Section>

      {/* ─── DataTable ─── */}
      <Section title="DataTable">
        <DataTable
          columns={columns}
          rows={sampleRows}
          getRowKey={(row) => row.id}
          page={0}
          rowsPerPage={10}
          totalRows={3}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
        />
      </Section>

      {/* ─── Form ─── */}
      <Section title="Form">
        <Box
          sx={{
            maxWidth: 480,
            p: 3,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: "12px",
          }}
        >
          <Form onSubmit={(e) => e.preventDefault()}>
            <FormTextField label="회사명" placeholder="(주)회사명" />
            <FormTextField label="사업자번호" placeholder="000-00-00000" />
            <FormTextField
              label="이메일"
              placeholder="contact@example.com"
              error="유효한 이메일을 입력해주세요"
            />
            <FormSelect
              label="상태"
              name="status"
              options={[
                { value: "active", label: "활성" },
                { value: "inactive", label: "비활성" },
                { value: "pending", label: "대기" },
              ]}
              value="active"
              onChange={() => {}}
            />
            <Box sx={{ mt: 2, display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button variant="outlined">취소</Button>
              <Button variant="contained" type="submit">
                저장
              </Button>
            </Box>
          </Form>
        </Box>
      </Section>

      {/* ─── Checkbox & Radio ─── */}
      <Section title="Checkbox & Radio">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 3,
          }}
        >
          <Box
            sx={{
              p: 3,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: "12px",
            }}
          >
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Checkbox
            </Typography>
            <Stack spacing={0}>
              <FormCheckbox label="이용약관 동의" checked />
              <FormCheckbox label="개인정보 수집 동의" checked />
              <FormCheckbox label="마케팅 수신 동의 (선택)" />
              <FormCheckbox label="비활성 항목" disabled />
              <FormCheckbox
                label="에러 상태"
                error="필수 항목입니다"
              />
            </Stack>
          </Box>
          <Box
            sx={{
              p: 3,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: "12px",
            }}
          >
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Radio
            </Typography>
            <Stack spacing={2}>
              <FormRadioGroup
                label="점검 주기"
                value="quarterly"
                options={[
                  { value: "monthly", label: "월간" },
                  { value: "quarterly", label: "분기별" },
                  { value: "biannual", label: "반기별" },
                  { value: "annual", label: "연간" },
                ]}
              />
              <FormRadioGroup
                label="알림 방식"
                value="email"
                row
                options={[
                  { value: "email", label: "이메일" },
                  { value: "sms", label: "SMS" },
                  { value: "both", label: "모두" },
                ]}
              />
              <FormRadioGroup
                label="에러 상태"
                options={[
                  { value: "a", label: "옵션 A" },
                  { value: "b", label: "옵션 B" },
                ]}
                error="하나를 선택해주세요"
              />
            </Stack>
          </Box>
        </Box>
      </Section>

      {/* ─── Dialog ─── */}
      <Section title="Dialog">
        <Button variant="outlined" onClick={() => setDialogOpen(true)}>
          다이얼로그 열기
        </Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="수탁사 삭제"
          maxWidth="xs"
          actions={
            <>
              <Button variant="outlined" onClick={() => setDialogOpen(false)}>
                취소
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => setDialogOpen(false)}
              >
                삭제
              </Button>
            </>
          }
        >
          <Typography variant="body2" sx={{ color: colors.fg.secondary }}>
            &apos;(주)클라우드테크&apos;를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </Typography>
        </Dialog>
      </Section>

      {/* ─── EmptyState ─── */}
      <Section title="EmptyState">
        <Box
          sx={{
            border: `1px solid ${colors.border.primary}`,
            borderRadius: "12px",
          }}
        >
          <EmptyState
            icon={<InboxIcon />}
            title="등록된 수탁사가 없습니다"
            description="수탁사를 등록하여 개인정보 처리 위탁 관리를 시작하세요."
            action={
              <Button variant="contained" startIcon={<AddIcon />}>
                수탁사 등록
              </Button>
            }
          />
        </Box>
      </Section>

      {/* ─── Chip ─── */}
      <Section title="Chip">
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip label="기본" />
          <Chip label="Primary" color="primary" />
          <Chip label="Success" color="success" />
          <Chip label="Warning" color="warning" />
          <Chip label="Error" color="error" />
          <Chip label="삭제 가능" onDelete={() => {}} />
          <Chip label="Outlined" variant="outlined" />
        </Box>
      </Section>

      {/* ─── Alert ─── */}
      <Section title="Alert">
        <Stack spacing={1.5}>
          <Alert severity="info">정보: 다음 점검 예정일은 2월 28일입니다.</Alert>
          <Alert severity="success">성공: 수탁사 정보가 저장되었습니다.</Alert>
          <Alert severity="warning">
            경고: 3개 수탁사의 계약이 만료 예정입니다.
          </Alert>
          <Alert severity="error">
            오류: 데이터를 불러오는 중 문제가 발생했습니다.
          </Alert>
        </Stack>
      </Section>
    </Box>
  );
}
