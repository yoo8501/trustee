# Plan: 체크리스트 기한 및 재제출 플로우 (checklist-deadline-flow)

## 1. 개요

위탁사가 수탁사에게 체크리스트 링크를 전달할 때 **작성 기한(deadline)**을 필수로 설정하고, 수탁사는 기한 내에 **여러 번 제출(수정 후 재제출)**할 수 있으며, 위탁사는 **기한이 종료된 후에만 검토를 진행**하는 플로우로 변경한다.

## 2. 현재 vs 변경 비교

### 현재 플로우
```
draft → sent → in_progress → submitted → reviewed
                                 ↑
                          (1회만 제출, 이후 읽기 전용)
```

- `accessTokenExpiresAt`은 optional (미사용 중)
- 제출 1회만 가능, 제출 후 수정 불가
- 위탁사가 아무 때나 "검토 완료" 가능

### 변경 후 플로우
```
draft → sent → in_progress ⇄ submitted → [기한 만료] → reviewed
                    ↑              │
                    └──── 재수정 ───┘  (기한 내 반복 가능)
```

- `deadline` (작성 기한) **필수** 설정
- 수탁사: 기한 내 제출/재수정/재제출 무한 반복 가능
- 수탁사: 기한 만료 후 접근 시 읽기 전용 (수정 불가)
- 위탁사: 기한 만료 전에는 검토 불가 → 기한 만료 후에만 "검토" 가능

## 3. 상태 흐름 (변경)

```
draft → sent → in_progress ⇄ submitted → reviewed
  │       │         │    ↑        │           │
  │       │         │    └────────┘           │
  │       │         │   (기한 내 재수정/재제출)│
  │       │         └─ 수탁사가 작성 시작      │
  │       └─ 위탁사가 기한 설정 + 링크 발급    │
  └─ 체크리스트 생성 직후                      │
                                               └─ 위탁사가 기한 만료 후 검토 완료
```

### 상태별 행위

| 상태 | 수탁사 | 위탁사 |
|------|--------|--------|
| `draft` | 접근 불가 | 편집 가능 |
| `sent` | 조회/작성 가능 | 토큰 링크 확인, 기한 변경 가능 |
| `in_progress` | 작성/저장 가능 | 작성 현황 조회 (읽기 전용) |
| `submitted` | **기한 내: 재수정 가능** / 기한 후: 읽기 전용 | 기한 전: 검토 불가 / **기한 후: 검토 가능** |
| `reviewed` | 읽기 전용 | 검토 결과 확인 |

## 4. 데이터 모델 변경

### 4.1 TrusteeChecklist 모델 변경

| 필드 | 변경 내용 |
|------|----------|
| `accessTokenExpiresAt` | **optional → required** (기한 필수) |
| `submittedAt` | 유지 (마지막 제출 시각으로 갱신) |
| `submissionCount` | **신규** - 제출 횟수 (Int, default 0) |

```prisma
model TrusteeChecklist {
  // 기존 필드 유지...

  // 토큰 기반 접근 - deadline 필수화
  accessToken          String    @unique @default(uuid()) @map("access_token")
  accessTokenExpiresAt DateTime  @map("access_token_expires_at")  // nullable → required

  // 제출 횟수 추가
  submissionCount Int @default(0) @map("submission_count")

  // 작성자 정보 (첫 제출 시 입력, 이후 수정 가능)
  contactName  String? @map("contact_name")
  contactEmail String? @map("contact_email")
  contactPhone String? @map("contact_phone")
}
```

### 4.2 타입 변경 (@trustee/types)

```typescript
// CreateTrusteeChecklistInput에 deadline 추가
export interface CreateTrusteeChecklistInput {
  trusteeId: string;
  templateId: string;
  inspectionScope?: string;
  deadline: string;  // ISO string, 필수
}

// TrusteeChecklist에 submissionCount 추가
export interface TrusteeChecklist {
  // ... 기존 필드
  accessTokenExpiresAt: string;  // nullable → required
  submissionCount: number;       // 신규
}
```

## 5. API 변경

### 5.1 위탁사(관리자) API 변경

| Method | Path | 변경 내용 |
|--------|------|----------|
| `POST` | `/api/trustee-checklists` | `deadline` 필수 파라미터 추가 |
| `PATCH` | `/api/trustee-checklists/:id` | `deadline` 변경 가능 (기한 전에만) |
| `PATCH` | `/api/trustee-checklists/:id` (reviewed) | **기한 만료 후에만** `reviewed`로 변경 가능 |

### 5.2 수탁사(토큰) API 변경

| Method | Path | 변경 내용 |
|--------|------|----------|
| `POST` | `/api/checklist-response/:token/submit` | 기한 내 재제출 허용 (submitted → in_progress → submitted 반복) |
| `PATCH` | `/api/checklist-response/:token/items/*` | submitted 상태에서도 기한 내이면 수정 가능 |
| `POST` | `/api/checklist-response/:token/reopen` | **신규** - 수탁사가 제출 후 재수정 시작 (submitted → in_progress) |

### 5.3 수정되는 비즈니스 룰

**현재**:
- `validateEditable()`: submitted/reviewed → 수정 불가

**변경 후**:
- `validateEditable()`: 기한 내 + (sent | in_progress | submitted) → 수정 가능
- `validateEditable()`: 기한 만료 OR reviewed → 수정 불가
- `validateReviewable()`: 기한 만료 + submitted → 검토 가능

```
수탁사 수정 가능 조건:
  기한 내 AND (status = sent OR in_progress OR submitted)

위탁사 검토 가능 조건:
  기한 만료 AND status = submitted
```

## 6. 프론트엔드 변경

### 6.1 체크리스트 생성 페이지 (`/inspections/checklists/new`)

- **기한(deadline) 날짜 선택 필드 추가** (필수)
- DatePicker 또는 `<input type="date">` 사용
- 기본값: 오늘 + 14일

### 6.2 체크리스트 상세 페이지 (`/inspections/checklists/:id`)

- **기한 표시** (D-day 카운트다운)
- **기한 변경 기능** (기한 전에만)
- **검토 완료 버튼**: 기한 만료 전에는 비활성화 + "기한 종료 후 검토 가능합니다" 안내
- **제출 횟수** 표시 (`submissionCount`)
- **마지막 제출일** 표시 (`submittedAt`)

### 6.3 체크리스트 목록 페이지 (`/inspections/checklists`)

- **기한 컬럼 추가** (D-day 또는 "만료됨" 표시)
- **제출 횟수 컬럼 추가**

### 6.4 수탁사 작성 페이지 (`/checklist/:token`)

- **상단에 기한 안내 표시** ("작성 기한: 2026-03-01까지 (D-10)")
- **submitted 상태에서도 기한 내이면** "수정하기" 버튼 표시
- "수정하기" 클릭 시 → reopen API 호출 → 수정 모드로 전환
- **기한 만료 시**: "작성 기한이 종료되었습니다" Alert + 읽기 전용
- **제출 완료 메시지 변경**: "제출 완료. 기한 내에 수정 후 재제출이 가능합니다."

## 7. 구현 순서

### Step 1: DB 스키마 변경
1. `accessTokenExpiresAt` → required로 변경
2. `submissionCount Int @default(0)` 추가
3. `prisma db push`

### Step 2: 타입 변경 (@trustee/types)
1. `CreateTrusteeChecklistInput`에 `deadline` 필수 필드 추가
2. `TrusteeChecklist`에 `submissionCount` 추가, `accessTokenExpiresAt` required로 변경

### Step 3: Backend - Validation 변경
1. `createTrusteeChecklistSchema`에 `deadline` 필수 추가
2. `submitChecklistSchema` 유지 (변경 없음)

### Step 4: Backend - Service 로직 변경
1. `TrusteeChecklistService.create()`: `deadline`을 `accessTokenExpiresAt`에 설정
2. `TrusteeChecklistService.update()`: reviewed 변경 시 기한 만료 검증
3. `ChecklistResponseService.validateEditable()`: 기한 내 + submitted도 수정 가능하도록 변경
4. `ChecklistResponseService.submit()`: `submissionCount` 증가, `submittedAt` 갱신 (기존 submitted에서도 재제출 가능)
5. `ChecklistResponseService.reopen()`: 신규 메서드 (submitted → in_progress)
6. `ChecklistResponseService.validateTokenExpiry()`: 기한 만료 시 읽기만 허용 (수정 불가)

### Step 5: Backend - Controller/Routes 변경
1. `ChecklistResponseController.reopen` 핸들러 추가
2. `checklist-response.routes.ts`에 `POST /:token/reopen` 추가

### Step 6: Frontend - API 클라이언트 변경
1. `trustee-checklists.ts`: create에 `deadline` 포함
2. `checklist-response.ts`: `reopen()` 추가

### Step 7: Frontend - 체크리스트 생성 페이지 변경
1. DatePicker(기한) 필드 추가 (필수, 기본값 오늘+14일)

### Step 8: Frontend - 체크리스트 상세 페이지 변경
1. 기한 D-day 표시
2. 기한 변경 기능
3. 검토 완료 버튼 조건부 활성화 (기한 만료 후에만)
4. 제출 횟수 표시

### Step 9: Frontend - 체크리스트 목록 페이지 변경
1. 기한 컬럼 추가
2. 제출 횟수 컬럼 추가

### Step 10: Frontend - 수탁사 작성 페이지 변경
1. 기한 안내 표시
2. submitted 상태에서 "수정하기" 버튼 (기한 내)
3. 기한 만료 시 읽기 전용 모드 + 안내 메시지
4. 제출 완료 메시지 변경

## 8. 보안 고려사항

| 항목 | 대응 |
|------|------|
| 기한 우회 방지 | 서버에서 기한 검증 (프론트엔드 검증만으로 불충분) |
| 기한 만료 후 수정 시도 | 403 Forbidden + "작성 기한이 종료되었습니다" |
| 기한 전 검토 시도 | 400 Bad Request + "기한 종료 후 검토 가능합니다" |
| 기한 변경 권한 | 위탁사만 가능, 기한 전에만 변경 가능 |

## 9. 영향 범위

| 패키지 | 변경 내용 |
|--------|----------|
| `backend/services/inspection/prisma` | `accessTokenExpiresAt` required, `submissionCount` 추가 |
| `backend/services/inspection/src` | Service 로직 변경 (validateEditable, submit, reopen) |
| `backend/packages/types` | CreateInput에 deadline 추가, TrusteeChecklist에 submissionCount |
| `frontend/web/src/app/(dashboard)/inspections/checklists` | 생성/상세/목록 페이지 변경 |
| `frontend/web/src/app/checklist/[token]` | 기한 안내, 재수정 기능, 읽기 전용 모드 |
| `frontend/web/src/lib/api` | create에 deadline, reopen API 추가 |
| `frontend/web/src/hooks` | reopen 훅 추가 |

## 10. 완료 조건

- [ ] 체크리스트 생성 시 기한(deadline) 필수 설정
- [ ] 기한 내 수탁사 복수 제출 가능 (제출 후 재수정 → 재제출 반복)
- [ ] 기한 만료 후 수탁사 작성/수정 불가 (읽기 전용)
- [ ] 위탁사는 기한 만료 후에만 검토 진행 가능
- [ ] 수탁사 페이지에 기한 D-day 표시
- [ ] 위탁사 페이지에 기한, 제출 횟수 표시
- [ ] 기한 변경 기능 (기한 전에만)
- [ ] TypeScript 에러 없음
- [ ] 한국어 UI
