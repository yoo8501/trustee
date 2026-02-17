# Design: 로그인 페이지 디자인 시스템 적용

> Plan 문서: `docs/01-plan/features/login-design-system.plan.md`

## 1. 설계 원칙

### 1.1 Import 규칙
- `@trustee/ui`에서 re-export하는 MUI 컴포넌트는 반드시 `@trustee/ui`에서 import
- `@trustee/ui`에 없는 MUI 컴포넌트만 `@mui/material/{Component}` 직접 import
- 디자인 토큰(`colors`, `typography`, `radius`)은 `@trustee/ui`에서 import

### 1.2 스타일링 규칙
- 하드코딩 색상값 사용 금지 → `colors.*` 토큰만 사용
- 테마에서 이미 처리하는 스타일은 `sx`로 중복 지정하지 않음
- `sx` prop은 레이아웃(간격, 크기)에만 사용하고, 색상/폰트는 테마에 위임

### 1.3 `@trustee/ui`에서 사용 가능한 re-export 목록
```
Box, Container, Stack, Grid, Paper, Card, CardContent, CardActions, CardHeader,
Typography, Chip, Avatar, Divider, Alert, Snackbar, Skeleton, CircularProgress,
LinearProgress, Tooltip, Badge, Tabs, Tab, Breadcrumbs, Link
```

## 2. 파일별 상세 설계

### 2.1 Auth Layout (`(auth)/layout.tsx`)

**Before (import)**:
```tsx
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
```

**After (import)**:
```tsx
import { Box, Container, Paper, Typography, colors } from "@trustee/ui";
```

**After (구조)**:
```tsx
<Box sx={{
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.bg.primary,
  py: 4,
}}>
  <Container maxWidth="sm">
    <Paper elevation={0} sx={{
      p: { xs: 3, sm: 5 },
      borderRadius: "12px",
      backgroundColor: colors.bg.level1,
      border: `1px solid ${colors.border.primary}`,
    }}>
      {children}
    </Paper>
  </Container>
</Box>
```

**변경 포인트**:
- `elevation={1}` → `elevation={0}` (테마에서 border로 구분)
- `borderRadius: 2` → `"12px"` (radius.12 토큰)
- 명시적 `backgroundColor`, `border` 토큰 적용

---

### 2.2 SocialLoginButtons (`components/auth/SocialLoginButtons.tsx`)

**Before (import)**:
```tsx
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
```

**After (import)**:
```tsx
import { Button, Stack, Divider, Typography, colors } from "@trustee/ui";
```

**After (소셜 버튼 스타일)**:
```tsx
// Google 버튼 - 다크 테마 적합
sx={{
  borderColor: colors.border.secondary,
  color: colors.fg.secondary,
  "&:hover": {
    borderColor: colors.border.tertiary,
    backgroundColor: colors.bg.translucent,
  },
}}

// GitHub 버튼 - 다크 테마 적합
sx={{
  borderColor: colors.border.secondary,
  color: colors.fg.secondary,
  "&:hover": {
    borderColor: colors.border.tertiary,
    backgroundColor: colors.bg.translucent,
  },
}}
```

**변경 포인트**:
- 라이트 테마 하드코딩 색상 6개 제거: `#dadce0`, `#3c4043`, `#f8f9fa`, `#d0d7de`, `#24292f`, `#f6f8fa`
- `@trustee/ui`의 Button 사용 (loading 지원)
- Divider 텍스트 색상도 토큰 적용

---

### 2.3 PasswordField (`components/auth/PasswordField.tsx`)

**Before (import)**:
```tsx
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
```

**After (import)**:
```tsx
import InputAdornment from "@mui/material/InputAdornment";
import { IconButton } from "@trustee/ui";
```

**변경 포인트**:
- MUI IconButton → `@trustee/ui` IconButton으로 전환
- `InputAdornment`은 `@trustee/ui`에 re-export 없으므로 MUI 직접 import 유지
- `@trustee/ui` IconButton은 `size="small"`이 기본값이므로 별도 지정 불필요
- `edge="end"` prop이 `@trustee/ui` IconButton(MuiIconButtonProps 확장)에서 지원됨

---

### 2.4 로그인 페이지 (`(auth)/login/page.tsx`)

**Before (import)**:
```tsx
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { Button, Form, FormTextField } from "@trustee/ui";
```

**After (import)**:
```tsx
import NextLink from "next/link";
import {
  Box, Stack, Typography, Alert, Link,
  Button, Form, FormTextField, FormCheckbox, colors,
} from "@trustee/ui";
```

**Checkbox → FormCheckbox 전환**:
```tsx
// Before
<FormControlLabel
  control={<Checkbox size="small" />}
  label={<Typography variant="body2">로그인 상태 유지</Typography>}
/>

// After
<FormCheckbox label="로그인 상태 유지" />
```

**Link 스타일 통일**:
```tsx
// Before
<MuiLink component={NextLink} href="/forgot-password" variant="body2" underline="hover">

// After
<Link
  component={NextLink}
  href="/forgot-password"
  variant="body2"
  underline="hover"
  sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
>
```

**Button sx 간소화**:
```tsx
// Before
<Button ... sx={{ mt: 1, mb: 2, py: 1.2 }}>

// After (size="large"로 높이 처리, 간격만 sx)
<Button ... size="large" sx={{ mt: 1, mb: 2 }}>
```

**변경 포인트**:
- MUI 직접 import 6개 제거 (Typography, Box, Alert, Checkbox, FormControlLabel, Stack)
- `MuiLink` → `@trustee/ui`의 `Link`로 전환
- Checkbox + FormControlLabel → `FormCheckbox` 단일 컴포넌트
- 링크 색상 `colors.link.primary/hover` 토큰 적용
- Button에 `size="large"` 사용하여 `py: 1.2` sx 제거

---

### 2.5 회원가입 페이지 (`(auth)/signup/page.tsx`)

**Before (import)**:
```tsx
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";
import { Button, Form, FormTextField } from "@trustee/ui";
```

**After (import)**:
```tsx
import NextLink from "next/link";
import { Box, Typography, Alert, Link, Button, Form, FormTextField, colors } from "@trustee/ui";
```

**변경 포인트**:
- MUI 직접 import 4개 제거 (Typography, Box, Alert, MuiLink)
- Link 색상 토큰 적용
- Button `size="large"`, sx 간소화

---

### 2.6 비밀번호 찾기 페이지 (`(auth)/forgot-password/page.tsx`)

**Before (import)**:
```tsx
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";
import { Button, Form, FormTextField } from "@trustee/ui";
```

**After (import)**:
```tsx
import NextLink from "next/link";
import { Box, Typography, Alert, Link, Button, Form, FormTextField, colors } from "@trustee/ui";
```

**성공 상태 UI (sent=true)**:
```tsx
<Box textAlign="center">
  <Typography variant="h3" sx={{ mb: 1 }}>
    이메일을 확인해주세요
  </Typography>
  <Typography variant="body2" sx={{ color: colors.fg.tertiary, mb: 3 }}>
    비밀번호 재설정 링크가 이메일로 발송되었습니다.
    <br />
    이메일을 확인하고 링크를 클릭해주세요.
  </Typography>
  <Link
    component={NextLink}
    href="/login"
    underline="hover"
    sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
  >
    로그인으로 돌아가기
  </Link>
</Box>
```

**변경 포인트**:
- MUI 직접 import 4개 제거
- `variant="h5" fontWeight={700}` → `variant="h3"` (테마에서 fontWeight 처리)
- 성공 화면 색상 토큰 적용
- Link 색상 토큰 적용

---

### 2.7 비밀번호 재설정 페이지 (`(auth)/reset-password/page.tsx`)

**Before (import)**:
```tsx
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";
import { Button, Form } from "@trustee/ui";
```

**After (import)**:
```tsx
import NextLink from "next/link";
import { Box, Typography, Alert, Link, Button, Form, colors } from "@trustee/ui";
```

**유효하지 않은 토큰 UI (!token)**:
```tsx
<Box textAlign="center">
  <Typography variant="h3" sx={{ mb: 1 }}>
    유효하지 않은 링크
  </Typography>
  <Typography variant="body2" sx={{ color: colors.fg.tertiary, mb: 3 }}>
    비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.
  </Typography>
  <Link
    component={NextLink}
    href="/forgot-password"
    underline="hover"
    sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
  >
    비밀번호 찾기 다시 요청
  </Link>
</Box>
```

**변경 포인트**:
- MUI 직접 import 4개 제거
- Typography variant 정리
- Link, 에러 상태 색상 토큰 적용

---

## 3. Typography Variant 매핑

현재 Auth 페이지에서 `variant="h5" fontWeight={700}`로 사용하던 제목을 디자인 시스템 variant로 정리:

| 용도 | Before | After | 이유 |
|------|--------|-------|------|
| 페이지 제목 | `h5` + `fontWeight={700}` | `h3` | h3이 title3(1.25rem) + semibold, 카드 내 제목에 적합 |
| 부제목/설명 | `body2` + `color="text.secondary"` | `body2` + `color={colors.fg.tertiary}` | 토큰 직접 참조 |
| 폼 링크 | `body2` | `body2` | 변경 없음 |

---

## 4. 공통 Link 스타일 패턴

모든 Auth 페이지에서 반복되는 Link 스타일:

```tsx
<Link
  component={NextLink}
  href={targetHref}
  variant="body2"
  underline="hover"
  sx={{
    color: colors.link.primary,
    "&:hover": { color: colors.link.hover },
  }}
>
  {label}
</Link>
```

---

## 5. 구현 순서

| 순서 | 파일 | 작업 | 의존성 |
|------|------|------|--------|
| 1 | `(auth)/layout.tsx` | 토큰 기반 레이아웃 | 없음 |
| 2 | `SocialLoginButtons.tsx` | 다크 테마 색상 적용 | 없음 |
| 3 | `PasswordField.tsx` | IconButton 전환 | 없음 |
| 4 | `(auth)/login/page.tsx` | 풀 리팩토링 | #1, #2, #3 |
| 5 | `(auth)/signup/page.tsx` | import + 스타일 정리 | #1, #3 |
| 6 | `(auth)/forgot-password/page.tsx` | import + 스타일 정리 | #1 |
| 7 | `(auth)/reset-password/page.tsx` | import + 스타일 정리 | #1, #3 |

## 6. 변경하지 않는 것

- 비즈니스 로직 (useAuth, authApi, validation schema, useForm)
- 라우팅 구조 ((auth) 그룹)
- AuthProvider 컴포넌트
- 기능 동작 (폼 제출, 에러 처리, 리다이렉트, searchParams 처리)
- `@trustee/ui` 컴포넌트 내부 구현 (이미 테마 적용됨)

## 7. 검증 기준

| 항목 | 기준 |
|------|------|
| 하드코딩 색상 | 0개 (모든 색상은 `colors.*` 토큰) |
| MUI 직접 import | Auth 페이지 전체에서 `InputAdornment`, `Visibility`/`VisibilityOff` 아이콘만 허용 |
| TypeScript 에러 | 0개 |
| 기능 회귀 | 로그인/회원가입/비밀번호 찾기/재설정 모든 플로우 정상 동작 |
| 디자인 일관성 | 모든 Auth 페이지가 동일한 다크 테마 톤 유지 |
