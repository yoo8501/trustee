# Plan: 수탁사 체크리스트 제출 (trustee-checklist-submission)

## 1. 개요

수탁사의 담당자가 보안점검 체크리스트를 **직접 작성하여 위탁사에 제출**하는 기능을 구현한다.
위탁사(관리자)가 체크리스트를 생성하면 **고유 토큰 링크**가 발급되고, 수탁사 담당자는 이 링크로 로그인 없이 접속하여 체크리스트를 작성하고 제출한다.

## 2. 핵심 워크플로우

```
[위탁사] 체크리스트 생성 (템플릿 + 수탁사 선택)
    ↓
[시스템] 고유 액세스 토큰 + URL 발급
    ↓
[위탁사] 수탁사 담당자에게 URL 전달 (복사하여 이메일/메신저로 전달)
    ↓
[수탁사] 토큰 링크로 접속 → 체크리스트 작성 페이지 표시
    ↓
[수탁사] 각 항목별 답변(예/아니오/해당없음), 현황, 증빙자료, 비고 작성
    ↓
[수탁사] 임시저장 가능 (같은 링크로 재접속하여 이어서 작성)
    ↓
[수탁사] "제출" 버튼 클릭 → 상태 submitted으로 변경
    ↓
[위탁사] 제출된 체크리스트 확인 및 검토 (상태 reviewed로 변경)
```

## 3. 상태 흐름

```
draft → sent → in_progress → submitted → reviewed
  │       │         │             │           │
  │       │         │             │           └─ 위탁사가 검토 완료
  │       │         │             └─ 수탁사가 제출
  │       │         └─ 수탁사가 작성 시작 (첫 저장 시)
  │       └─ 위탁사가 링크 발급 완료
  └─ 체크리스트 생성 직후
```

## 4. 데이터 모델 변경

### 4.1 TrusteeChecklist 모델에 토큰 필드 추가

| 필드 | 타입 | 설명 |
|------|------|------|
| accessToken | String (unique) | 수탁사 접속용 고유 토큰 (UUID v4) |
| accessTokenExpiresAt | DateTime? | 토큰 만료일 (선택, null이면 무제한) |
| contactName | String? | 작성자명 (수탁사 담당자가 작성 시 입력) |
| contactEmail | String? | 작성자 이메일 |
| contactPhone | String? | 작성자 연락처 |

```prisma
model TrusteeChecklist {
  // 기존 필드 유지
  id              String                 @id @default(cuid())
  trusteeId       String                 @map("trustee_id")
  templateId      String?                @map("template_id")
  templateVersion String?                @map("template_version")
  title           String
  inspectionScope String?                @map("inspection_scope") @db.Text
  status          TrusteeChecklistStatus @default(draft)
  submittedAt     DateTime?              @map("submitted_at")
  createdAt       DateTime               @default(now()) @map("created_at")
  updatedAt       DateTime               @updatedAt @map("updated_at")

  // ── 신규 필드 ──
  accessToken          String    @unique @map("access_token")
  accessTokenExpiresAt DateTime? @map("access_token_expires_at")
  contactName          String?   @map("contact_name")
  contactEmail         String?   @map("contact_email")
  contactPhone         String?   @map("contact_phone")

  categories TrusteeChecklistCategory[]

  @@map("trustee_checklists")
}
```

### 4.2 타입 변경 (@trustee/types)

```typescript
// TrusteeChecklist 인터페이스에 추가
export interface TrusteeChecklist {
  // ... 기존 필드
  accessToken: string;
  accessTokenExpiresAt?: Date;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

// 수탁사 담당자 정보 입력
export interface TrusteeChecklistContactInput {
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
}

// 수탁사 측 제출 요청
export interface SubmitTrusteeChecklistInput {
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
}
```

## 5. API 설계

### 5.1 위탁사(관리자) API - 기존 확장

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/trustee-checklists` | 체크리스트 생성 (**accessToken 자동 발급, 상태 sent로 변경**) |
| `GET` | `/api/trustee-checklists/:id` | 체크리스트 상세 (accessToken URL 표시) |
| `PATCH` | `/api/trustee-checklists/:id` | 상태 변경 (reviewed 등) |
| `POST` | `/api/trustee-checklists/:id/regenerate-token` | 토큰 재발급 (기존 토큰 무효화) |

### 5.2 수탁사(토큰) API - **신규**

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/checklist-response/:token` | 토큰으로 체크리스트 조회 (수탁사 작성 페이지용) |
| `PATCH` | `/api/checklist-response/:token/items/:itemId` | 항목별 답변 저장 (자동저장) |
| `PATCH` | `/api/checklist-response/:token/items/batch` | 항목 일괄 저장 |
| `POST` | `/api/checklist-response/:token/submit` | 체크리스트 제출 (상태 → submitted) |

### 5.3 토큰 API 보안 규칙

- 토큰으로 접근 시 **해당 체크리스트만** 조회/수정 가능
- 만료된 토큰 → 403 Forbidden
- 이미 submitted/reviewed 상태 → 수정 불가 (읽기만 가능)
- 토큰은 URL-safe UUID v4 형식

## 6. 프론트엔드 페이지

### 6.1 위탁사(관리자) 페이지 변경

| 경로 | 변경 내용 |
|------|----------|
| `/inspections/checklists/new` | 생성 후 토큰 링크 표시 + 복사 버튼 |
| `/inspections/checklists/:id` | 토큰 링크 표시, 상태 표시 개선, "검토 완료" 버튼 추가 |
| `/inspections/checklists` | 상태별 필터, 제출일 컬럼 추가 |

### 6.2 수탁사 응답 페이지 - **신규**

| 경로 | 설명 |
|------|------|
| `/checklist/:token` | 수탁사 체크리스트 작성 페이지 (메인) |

#### 수탁사 작성 페이지 UI 구성

```
┌─────────────────────────────────────────────┐
│  [수탁사명] 보안 점검 체크리스트              │
│  점검 범위: OOOO                             │
├─────────────────────────────────────────────┤
│  작성자 정보                                 │
│  ┌─────────────┐ ┌─────────────┐            │
│  │ 담당자명 *  │ │ 이메일      │            │
│  └─────────────┘ └─────────────┘            │
│  ┌─────────────┐                             │
│  │ 연락처      │                             │
│  └─────────────┘                             │
├─────────────────────────────────────────────┤
│  1. 관리적보호조치                           │
│  ├─ 1.1 개인정보보호정책                     │
│  │  ┌───────────────────────────────────┐   │
│  │  │ 1.1.1 개인정보보호 방침을 수립... │   │
│  │  │ 대상여부: [Y] [N]                  │   │
│  │  │ 답변: [예] [아니오] [해당없음]     │   │
│  │  │ 현황: [________________]           │   │
│  │  │ 증빙자료: [________________]       │   │
│  │  │ 비고: [________________]           │   │
│  │  └───────────────────────────────────┘   │
│  │  ┌───────────────────────────────────┐   │
│  │  │ 1.1.2 ...                         │   │
│  ...                                        │
├─────────────────────────────────────────────┤
│  진행률: ██████████░░░░░░ 45/72 항목        │
│                                              │
│  [임시저장]              [제출]              │
└─────────────────────────────────────────────┘
```

#### 수탁사 작성 페이지 기능 요구사항

1. **작성자 정보 입력**: 담당자명(필수), 이메일, 연락처
2. **범주별 아코디언**: 3개 범주를 아코디언으로 표시, 클릭하여 펼치기/접기
3. **항목별 답변 입력**:
   - 대상여부: Y/N 토글
   - 답변: 예/아니오/해당없음 라디오 버튼 (대상여부 N이면 비활성화)
   - 현황: 텍스트 입력
   - 증빙자료: 텍스트 입력
   - 비고: 텍스트 입력
4. **자동저장**: 항목 값 변경 시 debounce(2초) 후 자동 저장 (batch API)
5. **진행률 표시**: 답변 완료된 항목 수 / 전체 항목 수
6. **임시저장 버튼**: 현재 작성 내용 즉시 저장
7. **제출 버튼**: 미답변 항목 확인 → 확인 Dialog → 제출
8. **제출 후**: 읽기 전용으로 전환, "제출 완료" 메시지 표시
9. **레이아웃**: 사이드바 없는 독립 레이아웃 (수탁사 전용)

## 7. 구현 순서

### Phase 1: DB 스키마 변경
1. `TrusteeChecklist` 모델에 `accessToken`, `accessTokenExpiresAt`, `contactName`, `contactEmail`, `contactPhone` 추가
2. `pnpm --filter @trustee/inspection-service db:push`

### Phase 2: 공유 타입 추가
1. `@trustee/types`에 토큰 관련 필드 추가
2. `SubmitTrusteeChecklistInput` 타입 추가

### Phase 3: Backend - 토큰 발급 로직
1. 체크리스트 생성 시 `accessToken` 자동 생성 (UUID v4)
2. 상태를 `sent`로 자동 변경
3. 토큰 재발급 API 추가

### Phase 4: Backend - 수탁사 응답 API
1. `checklist-response.controller.ts` - 토큰 기반 접근 컨트롤러
2. `checklist-response.routes.ts` - `/api/checklist-response/:token/*` 라우트
3. 토큰 검증 미들웨어 (만료 확인, 상태 확인)
4. 항목 저장/일괄 저장/제출 API

### Phase 5: Gateway 프록시 추가
1. `/api/checklist-response/**` → inspection-service

### Phase 6: Frontend - 위탁사 페이지 개선
1. 체크리스트 생성 후 토큰 링크 표시 + 복사 기능
2. 체크리스트 상세 페이지에 토큰 URL, 상태 뱃지, 검토 완료 버튼
3. 목록 페이지에 상태 필터 + 제출일 컬럼

### Phase 7: Frontend - 수탁사 작성 페이지
1. `/checklist/:token` 라우트 (대시보드 레이아웃 밖, 독립 레이아웃)
2. 토큰으로 체크리스트 데이터 로드
3. 작성자 정보 입력 섹션
4. 범주별 아코디언 + 항목별 답변 폼
5. 자동저장 (debounce) + 임시저장 + 제출
6. 진행률 표시
7. 제출 완료 후 읽기 전용 모드

## 8. 보안 고려사항

| 항목 | 대응 |
|------|------|
| 토큰 유추 불가 | UUID v4 (128bit) 사용으로 추측 불가능 |
| 토큰 만료 | `accessTokenExpiresAt` 필드로 선택적 만료 설정 |
| 제출 후 수정 방지 | submitted/reviewed 상태에서는 수정 API 거부 |
| 토큰 노출 시 | 위탁사가 토큰 재발급 가능 (기존 토큰 무효화) |
| Rate Limiting | 토큰 API에 rate limit 적용 (추후) |

## 9. 영향 범위

| 패키지 | 변경 내용 |
|--------|----------|
| `backend/services/inspection` | Prisma 스키마 수정, 신규 라우트/컨트롤러 추가 |
| `backend/packages/types` | TrusteeChecklist 인터페이스 확장, 신규 Input 타입 |
| `backend/services/gateway` | `/api/checklist-response` 프록시 추가 |
| `frontend/web` | 위탁사 페이지 개선 + 수탁사 작성 페이지 신규 |

## 10. 완료 조건

- [ ] TrusteeChecklist에 accessToken 필드 추가 및 DB 반영
- [ ] 체크리스트 생성 시 토큰 자동 발급
- [ ] 토큰 기반 수탁사 응답 API (조회/저장/제출)
- [ ] 토큰 만료 및 상태 기반 접근 제어
- [ ] 위탁사: 체크리스트 생성 후 토큰 링크 표시/복사
- [ ] 위탁사: 체크리스트 상태 확인 및 검토 완료 기능
- [ ] 수탁사: 토큰 링크로 접속하여 체크리스트 작성
- [ ] 수탁사: 항목별 답변 자동저장 (debounce)
- [ ] 수탁사: 진행률 표시 + 제출 기능
- [ ] 수탁사: 제출 후 읽기 전용 전환
- [ ] TypeScript 에러 없음
- [ ] 한국어 UI
