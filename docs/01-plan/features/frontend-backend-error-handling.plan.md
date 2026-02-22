# Plan: 프론트엔드-백엔드 통신 에러 처리 통합

## 1. 개요

프론트엔드와 백엔드 간 API 통신에서 발생하는 에러를 체계적으로 처리하는 통합 에러 핸들링 시스템 구축

## 2. 현재 문제점

### 2.1 백엔드 (양호)
- `@trustee/common`에 에러 클래스 정의됨 (`AppError`, `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`)
- `errorHandler` 미들웨어로 일관된 에러 응답 형식 제공: `{ error: { code, message } }`
- **문제**: 네트워크 타임아웃, 서비스 간 gRPC 에러의 클라이언트 전파 방식 불명확

### 2.2 프론트엔드 API 클라이언트 (기본만 구현)
- `ApiError` 클래스 존재 (`status`, `code`, `message`)
- `response.ok` 체크 후 에러 throw
- **문제**: 네트워크 단절(fetch 자체 실패), 타임아웃, JSON 파싱 에러 미처리

### 2.3 프론트엔드 UI 에러 표시 (비일관)
- 각 페이지마다 `try-catch` + `useState`로 직접 에러 상태 관리
- `Snackbar` 사용 페이지와 `alert()` 사용 페이지 혼재
- React Query `onError` 콜백이 있는 곳과 없는 곳 혼재
- Next.js `error.tsx` (Error Boundary) 미사용
- 전역 에러 핸들링 없음

### 2.4 누락된 에러 시나리오
| 시나리오 | 현재 처리 |
|---------|----------|
| 네트워크 단절 (서버 다운) | 미처리 → 빈 화면 |
| API 타임아웃 | 미처리 → 무한 로딩 |
| 401 인증 만료 | 미처리 → 에러 메시지만 표시 |
| 403 권한 없음 | 미처리 |
| 404 리소스 없음 | 부분 처리 (일부 페이지만) |
| 409 중복 충돌 | 부분 처리 |
| 422 유효성 검증 | 부분 처리 (폼 에러) |
| 500 서버 에러 | 미처리 → 일반 에러 메시지 |
| Rate Limiting (429) | 미처리 |

## 3. 목표

1. **통합 에러 처리 계층 구축**: API 클라이언트 → React Query → UI 3단계
2. **전역 에러 알림 시스템**: Snackbar 기반 Toast 알림 통합
3. **HTTP 상태별 자동 처리**: 401→로그인 리다이렉트, 403→접근 거부, 404→Not Found 등
4. **네트워크 에러 처리**: 오프라인 감지, 재시도, 타임아웃
5. **Next.js Error Boundary**: `error.tsx`를 활용한 렌더링 에러 포착
6. **개발자 경험(DX)**: 에러 처리 보일러플레이트 최소화

## 4. 구현 범위

### 4.1 API 클라이언트 개선 (`lib/api/client.ts`)
- 네트워크 에러 분류 (타임아웃, 오프라인, 서버 에러)
- 요청 타임아웃 설정 (기본 30초)
- 401 응답 시 자동 토큰 리프레시 또는 로그인 리다이렉트
- 에러 응답 구조 정규화

### 4.2 전역 Toast/Snackbar 시스템
- Context 기반 전역 Snackbar Provider
- `useToast()` 훅으로 어디서나 알림 호출
- 성공/에러/경고/정보 4가지 타입
- 자동 닫힘 (5초) + 수동 닫기

### 4.3 React Query 전역 에러 핸들링
- `QueryClient` 설정에서 전역 `onError` 콜백
- 에러 코드별 자동 Toast 표시
- Mutation 에러 자동 처리
- 재시도 전략 (네트워크 에러만 재시도, 4xx는 재시도 안 함)

### 4.4 Next.js Error Boundary
- `app/(dashboard)/error.tsx` - 대시보드 에러 페이지
- `app/error.tsx` - 글로벌 에러 페이지
- "다시 시도" 버튼 포함

### 4.5 페이지별 에러 처리 정리
- 기존 페이지의 분산된 에러 처리를 전역 시스템으로 통합
- 개별 `useState`+`Snackbar` 패턴 제거 → `useToast()` 전환
- Mutation `onError`에서 직접 `setSnackbar` → 전역 핸들러 위임

## 5. 변경 파일 목록 (예상)

### 신규
| 파일 | 설명 |
|------|------|
| `frontend/web/src/components/ToastProvider.tsx` | 전역 Snackbar Provider |
| `frontend/web/src/hooks/useToast.ts` | Toast 호출 훅 |
| `frontend/web/src/app/(dashboard)/error.tsx` | 대시보드 Error Boundary |
| `frontend/web/src/app/error.tsx` | 글로벌 Error Boundary |

### 수정
| 파일 | 설명 |
|------|------|
| `frontend/web/src/lib/api/client.ts` | 타임아웃, 네트워크 에러 분류, 401 처리 |
| `frontend/web/src/app/(dashboard)/layout.tsx` | ToastProvider 래핑 |
| `frontend/web/src/app/layout.tsx` | ToastProvider 래핑 |
| `frontend/web/src/hooks/useTrusteeChecklists.ts` | onError 통합 |
| `frontend/web/src/app/(dashboard)/inspections/**` | 분산 에러 처리 정리 |
| `frontend/web/src/app/checklist/[token]/page.tsx` | 분산 에러 처리 정리 |

## 6. 에러 처리 흐름 (설계 방향)

```
[API 요청]
  │
  ├── fetch 실패 (네트워크 에러)
  │     └── NetworkError throw → React Query retry (3회)
  │           └── 여전히 실패 → 전역 Toast "서버에 연결할 수 없습니다"
  │
  ├── 401 Unauthorized
  │     └── 토큰 리프레시 시도 → 실패 시 로그인 리다이렉트
  │
  ├── 403 Forbidden
  │     └── Toast "접근 권한이 없습니다"
  │
  ├── 404 Not Found
  │     └── 페이지 수준에서 처리 (Not Found UI)
  │
  ├── 409 Conflict
  │     └── Toast "이미 존재하는 데이터입니다" (서버 메시지 활용)
  │
  ├── 422 Validation Error
  │     └── 폼 에러 → 해당 필드에 에러 표시
  │
  ├── 500 Internal Error
  │     └── Toast "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
  │
  └── 기타 에러
        └── Toast "오류가 발생했습니다" + 콘솔 로깅
```

## 7. 우선순위

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | 전역 Toast 시스템 | 모든 에러 표시의 기반 |
| 2 | API 클라이언트 개선 | 에러 분류/정규화 |
| 3 | React Query 전역 에러 핸들링 | 자동 처리 |
| 4 | Error Boundary | 렌더링 에러 포착 |
| 5 | 기존 페이지 정리 | 통합 완성 |

## 8. 성공 기준

- [ ] 네트워크 단절 시 사용자에게 명확한 피드백 제공
- [ ] 401 인증 만료 시 자동 로그인 리다이렉트
- [ ] 모든 API 에러에 대해 Toast 알림 표시
- [ ] 기존 페이지의 분산 에러 처리 코드 60% 이상 제거
- [ ] `error.tsx` Error Boundary 동작 확인
- [ ] 콘솔 에러 0건
