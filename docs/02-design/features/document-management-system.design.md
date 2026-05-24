# DocFlow 문서관리시스템 Design Document

> **Summary**: SaaS 멀티테넌시 문서관리시스템 - 문서 CRUD, 폴더 분류, 버전 관리, 결재 워크플로우
>
> **Project**: DocFlow
> **Author**: seosangjun
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [document-management-system.plan.md](../01-plan/features/document-management-system.plan.md)

---

## 1. 개요

### 1.1 설계 목표

- 멀티테넌시 SaaS 구조로 회사(tenant)별 데이터 완전 격리
- Go + Gin 백엔드와 Next.js 15 프론트엔드의 명확한 역할 분리
- sqlc 기반 타입 안전한 DB 접근 계층
- 파일 스토리지 추상화 (로컬 → S3 전환 용이)
- 단계적 구현이 가능한 모듈형 설계

### 1.2 설계 원칙

- **Clean Architecture**: Handler → Service → Repository 계층 분리
- **Interface 추상화**: 스토리지, 인증 등 외부 의존성 인터페이스로 격리
- **멀티테넌시 우선**: 모든 쿼리에 tenant_id 조건 적용, PostgreSQL RLS
- **Fail-fast**: 입력 검증을 최우선으로, 에러는 가능한 빨리 반환

---

## 2. 아키텍처

### 2.1 시스템 구성도

```
┌──────────────────────────────────────────────────────────────┐
│                        클라이언트                              │
│  ┌─────────────────┐         ┌───────────────────────────┐   │
│  │ 퍼블릭 (SSR/SSG) │         │ 앱 영역 (CSR)              │   │
│  │ /login, /register│         │ /app/documents            │   │
│  └────────┬────────┘         │ /app/folders              │   │
│           │                  │ /app/approvals            │   │
│           │                  └────────────┬──────────────┘   │
│  Next.js 15 (App Router)                 │                   │
└───────────────────────┬──────────────────┘                   │
                        │ HTTP (REST API)                       │
                        ▼                                       │
┌──────────────────────────────────────────────────────────────┐
│                   Go API 서버 (Gin)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │Middleware │→│ Handler  │→│ Service  │→│ Repository   │ │
│  │(Auth,CORS)│  │(HTTP 처리)│  │(비즈니스) │  │(sqlc, DB)    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────┬───────┘ │
│                                                     │         │
│  ┌──────────────────┐                              │         │
│  │ Storage Interface │ (Local / S3)                 │         │
│  └──────────────────┘                              │         │
└────────────────────────────────────────────────────┼─────────┘
                                                     │
                                              ┌──────▼───────┐
                                              │  PostgreSQL   │
                                              │  (RLS 격리)   │
                                              └──────────────┘
```

### 2.2 데이터 흐름

```
[업로드 예시]
User → Next.js Form → POST /api/documents (multipart/form-data)
  → Auth Middleware (JWT 검증, tenant_id 추출)
  → DocumentHandler.Create
  → DocumentService.Upload (파일 저장 + 메타데이터)
  → StorageInterface.Save (로컬/S3)
  → DocumentRepository.Create (sqlc)
  → Response { data: Document }

[결재 예시]
User → POST /api/approvals
  → ApprovalService.Create (결재 생성 + 단계 생성)
  → ApprovalRepository.CreateWithSteps
  → NotificationService.Notify (인앱 알림)
```

### 2.3 의존성 맵

| 컴포넌트 | 의존 대상 | 용도 |
|----------|----------|------|
| Handler | Service | 비즈니스 로직 위임 |
| Service | Repository, Storage | 데이터 접근, 파일 저장 |
| Repository | sqlc 생성 코드, PostgreSQL | DB 쿼리 |
| Middleware | JWT 라이브러리 | 인증/인가 |
| Frontend API Client | Go API 서버 | REST 통신 |

---

## 3. 데이터 모델

### 3.1 ERD

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   tenants    │     │     users       │     │     folders      │
├─────────────┤     ├─────────────────┤     ├──────────────────┤
│ id (PK)     │◄──┐ │ id (PK)         │  ┌─▶│ id (PK)          │
│ name        │   │ │ tenant_id (FK)  │──┘  │ tenant_id (FK)   │
│ slug        │   │ │ email           │     │ name             │
│ created_at  │   │ │ password_hash   │     │ parent_id (FK)   │◄─┐
└─────────────┘   │ │ name            │     │ owner_id (FK)    │  │
                  │ │ role            │     │ is_system        │  │
                  │ │ created_at      │     │ sort_order       │  │
                  │ │ updated_at      │     │ created_at       │──┘
                  │ └─────────────────┘     │ updated_at       │
                  │                         └──────────────────┘
                  │
                  │ ┌─────────────────┐     ┌──────────────────────┐
                  │ │   documents     │     │  document_versions   │
                  │ ├─────────────────┤     ├──────────────────────┤
                  └─│ tenant_id (FK)  │     │ id (PK)              │
                    │ id (PK)         │◄────│ document_id (FK)     │
                    │ title           │     │ version_number       │
                    │ description     │     │ file_name            │
                    │ folder_id (FK)  │     │ file_size            │
                    │ uploader_id(FK) │     │ mime_type            │
                    │ current_ver_id  │     │ storage_path         │
                    │ status          │     │ change_note          │
                    │ tags (JSONB)    │     │ uploader_id (FK)     │
                    │ is_favorite     │     │ created_at           │
                    │ created_at      │     └──────────────────────┘
                    │ updated_at      │
                    │ deleted_at      │     ┌──────────────────────┐
                    └─────────────────┘     │    approvals         │
                           │                ├──────────────────────┤
                           │                │ id (PK)              │
                           └───────────────▶│ document_id (FK)     │
                                            │ tenant_id (FK)       │
                                            │ requester_id (FK)    │
                                            │ status               │
                                            │ created_at           │
                                            │ updated_at           │
                                            │ completed_at         │
                                            └──────────┬───────────┘
                                                       │
                                            ┌──────────▼───────────┐
                                            │   approval_steps     │
                                            ├──────────────────────┤
                                            │ id (PK)              │
                                            │ approval_id (FK)     │
                                            │ approver_id (FK)     │
                                            │ step_order           │
                                            │ status               │
                                            │ comment              │
                                            │ acted_at             │
                                            └──────────────────────┘
```

### 3.2 PostgreSQL 스키마

```sql
-- 테넌트 (회사)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

-- 폴더
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 문서
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    uploader_id UUID NOT NULL REFERENCES users(id),
    current_version_id UUID,  -- document_versions 생성 후 FK 추가
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
    tags JSONB DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 문서 버전
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    change_note TEXT,
    uploader_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, version_number)
);

-- documents.current_version_id FK 추가
ALTER TABLE documents
    ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id) REFERENCES document_versions(id);

-- 결재
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    requester_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 결재 단계
CREATE TABLE approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    step_order INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    comment TEXT,
    acted_at TIMESTAMPTZ,
    UNIQUE (approval_id, step_order)
);

-- 인덱스
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_folders_tenant ON folders(tenant_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_uploader ON documents(uploader_id);
CREATE INDEX idx_documents_status ON documents(tenant_id, status);
CREATE INDEX idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_documents_title_search ON documents USING gin(to_tsvector('simple', title));
CREATE INDEX idx_document_versions_doc ON document_versions(document_id);
CREATE INDEX idx_approvals_tenant ON approvals(tenant_id);
CREATE INDEX idx_approvals_document ON approvals(document_id);
CREATE INDEX idx_approvals_requester ON approvals(requester_id);
CREATE INDEX idx_approvals_status ON approvals(tenant_id, status);
CREATE INDEX idx_approval_steps_approval ON approval_steps(approval_id);
CREATE INDEX idx_approval_steps_approver ON approval_steps(approver_id);

-- RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
```

### 3.3 엔티티 관계 요약

```
Tenant ── 1:N → User
       ── 1:N → Folder
       ── 1:N → Document
       ── 1:N → Approval

User ──┬── 1:N → Document (uploader)
       ├── 1:N → Folder (owner)
       ├── 1:N → Approval (requester)
       ├── 1:N → ApprovalStep (approver)
       └── 1:N → DocumentVersion (uploader)

Folder ──┬── 1:N → Folder (parent-child, self-relation)
         └── 1:N → Document

Document ──┬── 1:N → DocumentVersion
           ├── N:1 → DocumentVersion (current_version)
           └── 1:N → Approval

Approval ── 1:N → ApprovalStep
```

---

## 4. API 상세 설계

### 4.1 공통 규칙

**인증**: 모든 `/api/*` 엔드포인트는 JWT Bearer 토큰 필수 (auth 제외)

**요청 헤더**:
```
Authorization: Bearer <jwt_token>
Content-Type: application/json (또는 multipart/form-data)
```

**응답 형식**:
```json
// 성공 (단일)
{ "data": { ... } }

// 성공 (목록)
{ "data": [...], "total": 100 }

// 에러
{ "error": { "code": "VALIDATION_ERROR", "message": "제목은 필수입니다" } }
```

**페이징 파라미터**: `?page=1&limit=20&sort=created_at&order=desc`

### 4.2 인증 API

#### POST /api/auth/register
```json
// Request
{
  "email": "user@company.com",
  "password": "securePass123!",
  "name": "홍길동",
  "tenant_name": "우리회사"    // 첫 가입 시 테넌트 생성
}

// Response 201
{
  "data": {
    "user": { "id": "uuid", "email": "...", "name": "...", "role": "admin" },
    "token": { "access_token": "jwt...", "refresh_token": "jwt...", "expires_in": 3600 }
  }
}
```

#### POST /api/auth/login
```json
// Request
{ "email": "user@company.com", "password": "securePass123!" }

// Response 200
{
  "data": {
    "user": { "id": "uuid", "email": "...", "name": "...", "role": "user", "tenant_id": "uuid" },
    "token": { "access_token": "jwt...", "refresh_token": "jwt...", "expires_in": 3600 }
  }
}
```

### 4.3 문서 API

#### POST /api/documents (multipart/form-data)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| file | File | O | 업로드 파일 (최대 50MB) |
| title | string | O | 문서 제목 (최대 500자) |
| description | string | X | 설명 |
| folder_id | UUID | X | 대상 폴더 (미지정 시 '내 문서') |
| tags | string[] | X | 태그 배열 (JSON) |

```json
// Response 201
{
  "data": {
    "id": "uuid",
    "title": "2026년 사업계획서",
    "description": "...",
    "folder_id": "uuid",
    "status": "active",
    "tags": ["사업계획", "2026"],
    "current_version": {
      "id": "uuid",
      "version_number": 1,
      "file_name": "사업계획서.pdf",
      "file_size": 1048576,
      "mime_type": "application/pdf"
    },
    "uploader": { "id": "uuid", "name": "홍길동" },
    "created_at": "2026-03-22T10:00:00Z"
  }
}
```

#### GET /api/documents
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| page | int | 페이지 번호 (기본 1) |
| limit | int | 페이지 크기 (기본 20, 최대 100) |
| folder_id | UUID | 폴더 필터 |
| status | string | 상태 필터 (active/draft/archived) |
| q | string | 제목/설명 검색어 |
| uploader_id | UUID | 작성자 필터 |
| mime_type | string | 파일 유형 필터 |
| sort | string | 정렬 필드 (created_at/title/updated_at) |
| order | string | 정렬 방향 (asc/desc) |

#### DELETE /api/documents/:id
- 소프트 삭제: `status = 'deleted'`, `deleted_at = NOW()`
- 휴지통으로 이동

#### POST /api/documents/:id/restore
- `status = 'active'`, `deleted_at = NULL`
- 원래 폴더로 복원 (폴더 삭제 시 루트로)

### 4.4 버전 API

#### POST /api/documents/:id/versions (multipart/form-data)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| file | File | O | 새 버전 파일 |
| change_note | string | X | 변경 사유 |

- 자동으로 version_number 증가
- documents.current_version_id 업데이트

#### POST /api/documents/:id/versions/:versionId/restore
- 해당 버전의 파일을 새 버전으로 복사 (version_number +1)
- change_note에 "버전 N에서 복원" 자동 입력

### 4.5 폴더 API

#### GET /api/folders
```json
// Response 200 - 전체 트리 구조
{
  "data": [
    {
      "id": "uuid",
      "name": "내 문서",
      "is_system": true,
      "children": [
        {
          "id": "uuid",
          "name": "프로젝트A",
          "children": [],
          "document_count": 5
        }
      ],
      "document_count": 12
    }
  ]
}
```

#### POST /api/folders
```json
// Request
{ "name": "프로젝트A", "parent_id": "uuid" }

// Response 201
{ "data": { "id": "uuid", "name": "프로젝트A", "parent_id": "uuid", ... } }
```

### 4.6 결재 API

#### POST /api/approvals
```json
// Request
{
  "document_id": "uuid",
  "steps": [
    { "approver_id": "uuid", "step_order": 1 },
    { "approver_id": "uuid", "step_order": 2 }
  ]
}

// Response 201
{
  "data": {
    "id": "uuid",
    "document_id": "uuid",
    "status": "pending",
    "steps": [
      { "id": "uuid", "approver": { "id": "uuid", "name": "김부장" }, "step_order": 1, "status": "pending" },
      { "id": "uuid", "approver": { "id": "uuid", "name": "이사장" }, "step_order": 2, "status": "pending" }
    ]
  }
}
```

#### POST /api/approvals/:id/approve
```json
// Request
{ "comment": "승인합니다" }

// 로직: 현재 step_order의 결재자만 승인 가능
// 마지막 단계 승인 시 approval.status = 'approved'
```

#### POST /api/approvals/:id/reject
```json
// Request
{ "comment": "수정 후 재상신 바랍니다" }  // comment 필수

// 로직: 즉시 approval.status = 'rejected'
```

### 4.7 검색 API

#### GET /api/search?q=사업계획&type=pdf&from=2026-01-01&to=2026-03-31
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "2026년 사업계획서",
      "description": "...",
      "file_name": "사업계획서.pdf",
      "mime_type": "application/pdf",
      "uploader": { "id": "uuid", "name": "홍길동" },
      "folder": { "id": "uuid", "name": "경영기획" },
      "highlight": "2026년 <mark>사업계획</mark>서",
      "created_at": "2026-03-22T10:00:00Z"
    }
  ],
  "total": 15
}
```
- PostgreSQL `to_tsvector` / `ts_rank` 활용한 전문 검색

---

## 5. 백엔드 상세 설계

### 5.1 Go 패키지 구조

```
backend/
├── cmd/
│   └── server/
│       └── main.go              # 엔트리포인트
├── internal/
│   ├── config/
│   │   └── config.go            # 환경 설정 로드
│   ├── handler/                 # HTTP 핸들러 (Presentation)
│   │   ├── auth_handler.go
│   │   ├── document_handler.go
│   │   ├── folder_handler.go
│   │   ├── approval_handler.go
│   │   ├── search_handler.go
│   │   └── user_handler.go
│   ├── service/                 # 비즈니스 로직 (Application)
│   │   ├── auth_service.go
│   │   ├── document_service.go
│   │   ├── folder_service.go
│   │   ├── approval_service.go
│   │   └── search_service.go
│   ├── repository/              # DB 접근 (Infrastructure)
│   │   └── (sqlc 자동 생성)
│   ├── middleware/
│   │   ├── auth.go              # JWT 검증 + tenant_id 추출
│   │   ├── cors.go
│   │   └── logger.go
│   ├── model/                   # 도메인 모델 (Domain)
│   │   ├── user.go
│   │   ├── document.go
│   │   ├── folder.go
│   │   └── approval.go
│   └── storage/                 # 파일 스토리지 인터페이스
│       ├── storage.go           # interface 정의
│       ├── local.go             # 로컬 파일시스템 구현
│       └── s3.go                # AWS S3 구현 (Phase 2)
├── db/
│   ├── migrations/
│   │   ├── 000001_create_tenants.up.sql
│   │   ├── 000001_create_tenants.down.sql
│   │   ├── 000002_create_users.up.sql
│   │   ├── 000003_create_folders.up.sql
│   │   ├── 000004_create_documents.up.sql
│   │   ├── 000005_create_document_versions.up.sql
│   │   ├── 000006_create_approvals.up.sql
│   │   └── 000007_create_approval_steps.up.sql
│   ├── queries/
│   │   ├── users.sql
│   │   ├── documents.sql
│   │   ├── folders.sql
│   │   ├── approvals.sql
│   │   └── search.sql
│   └── sqlc.yaml
├── go.mod
└── go.sum
```

### 5.2 스토리지 인터페이스

```go
// internal/storage/storage.go
type Storage interface {
    Save(ctx context.Context, path string, reader io.Reader) error
    Get(ctx context.Context, path string) (io.ReadCloser, error)
    Delete(ctx context.Context, path string) error
    Exists(ctx context.Context, path string) (bool, error)
}
```

- **저장 경로 규칙**: `{tenant_id}/{document_id}/{version_id}/{file_name}`
- Phase 1: `LocalStorage` (로컬 디스크, `./uploads/`)
- Phase 2: `S3Storage` (AWS S3 버킷)

### 5.3 JWT 토큰 구조

```json
{
  "sub": "user_uuid",
  "tenant_id": "tenant_uuid",
  "role": "admin",
  "exp": 1711108800,
  "iat": 1711105200
}
```

- Access Token: 1시간 만료
- Refresh Token: 7일 만료
- 미들웨어에서 `tenant_id`를 context에 주입 → 모든 쿼리에 활용

### 5.4 sqlc 설정

```yaml
# db/sqlc.yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "queries/"
    schema: "migrations/"
    gen:
      go:
        package: "repository"
        out: "../internal/repository"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
```

### 5.5 허용 MIME 타입

| 확장자 | MIME Type |
|--------|-----------|
| .pdf | application/pdf |
| .doc | application/msword |
| .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| .xls | application/vnd.ms-excel |
| .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| .ppt | application/vnd.ms-powerpoint |
| .pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation |
| .hwp | application/x-hwp |
| .jpg/.jpeg | image/jpeg |
| .png | image/png |
| .zip | application/zip |

---

## 6. 프론트엔드 상세 설계

### 6.1 디렉토리 구조

```
frontend/src/
├── app/                          # Next.js App Router
│   ├── (public)/                 # 퍼블릭 라우트 그룹
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx            # 퍼블릭 레이아웃 (헤더만)
│   ├── (app)/                    # 인증 필요 라우트 그룹
│   │   ├── layout.tsx            # 앱 레이아웃 (사이드바+헤더)
│   │   ├── page.tsx              # 대시보드 (/)
│   │   ├── documents/
│   │   │   ├── page.tsx          # 문서 목록
│   │   │   ├── [id]/page.tsx     # 문서 상세
│   │   │   └── upload/page.tsx   # 문서 업로드
│   │   ├── folders/
│   │   │   └── [id]/page.tsx     # 폴더 탐색
│   │   ├── approvals/
│   │   │   ├── page.tsx          # 결재 목록
│   │   │   └── [id]/page.tsx     # 결재 상세
│   │   ├── search/page.tsx       # 검색 결과
│   │   ├── trash/page.tsx        # 휴지통
│   │   ├── profile/page.tsx      # 내 정보
│   │   └── admin/
│   │       └── users/page.tsx    # 사용자 관리
│   └── layout.tsx                # 루트 레이아웃 (MUI ThemeProvider)
│
├── components/
│   ├── common/                   # 공통 컴포넌트
│   │   ├── AppSidebar.tsx        # 사이드바 (폴더트리, 메뉴)
│   │   ├── AppHeader.tsx         # 헤더 (검색바, 알림, 유저메뉴)
│   │   ├── ConfirmDialog.tsx
│   │   ├── EmptyState.tsx
│   │   └── LoadingSpinner.tsx
│   ├── documents/                # 문서 관련 컴포넌트
│   │   ├── DocumentList.tsx      # 문서 목록 (그리드/리스트 뷰)
│   │   ├── DocumentCard.tsx      # 문서 카드
│   │   ├── DocumentDetail.tsx    # 문서 상세 정보
│   │   ├── DocumentUpload.tsx    # 업로드 폼 (드래그&드롭)
│   │   ├── DocumentPreview.tsx   # 미리보기 (PDF/이미지)
│   │   └── VersionHistory.tsx    # 버전 이력 타임라인
│   ├── folders/
│   │   ├── FolderTree.tsx        # 폴더 트리 네비게이션
│   │   ├── FolderBreadcrumb.tsx  # 경로 표시
│   │   └── FolderDialog.tsx      # 폴더 생성/수정 다이얼로그
│   ├── approvals/
│   │   ├── ApprovalList.tsx      # 결재 목록 (탭: 요청/대기/완료)
│   │   ├── ApprovalDetail.tsx    # 결재 상세
│   │   ├── ApprovalFlow.tsx      # 결재선 시각화
│   │   └── ApprovalDialog.tsx    # 결재 요청 다이얼로그
│   └── auth/
│       ├── LoginForm.tsx
│       └── RegisterForm.tsx
│
├── hooks/
│   ├── useAuth.ts                # 인증 상태 관리
│   ├── useDocuments.ts           # 문서 CRUD (TanStack Query)
│   ├── useFolders.ts             # 폴더 CRUD
│   ├── useApprovals.ts           # 결재 관련
│   ├── useSearch.ts              # 검색
│   └── useFileUpload.ts          # 파일 업로드 (프로그레스)
│
├── lib/
│   ├── api/
│   │   ├── client.ts             # Axios 인스턴스 (인터셉터, 토큰)
│   │   ├── auth.ts               # 인증 API
│   │   ├── documents.ts          # 문서 API
│   │   ├── folders.ts            # 폴더 API
│   │   ├── approvals.ts          # 결재 API
│   │   └── search.ts             # 검색 API
│   ├── utils/
│   │   ├── format.ts             # 날짜, 파일크기 포맷
│   │   └── validation.ts         # Zod 스키마
│   └── constants.ts              # 상수 (MIME 타입, 상태값 등)
│
└── types/
    ├── auth.ts
    ├── document.ts
    ├── folder.ts
    ├── approval.ts
    └── api.ts                    # 공통 API 응답 타입
```

### 6.2 주요 TypeScript 타입

```typescript
// types/document.ts
interface Document {
  id: string;
  title: string;
  description: string | null;
  folder_id: string | null;
  status: 'draft' | 'active' | 'archived' | 'deleted';
  tags: string[];
  is_favorite: boolean;
  current_version: DocumentVersion;
  uploader: UserSummary;
  created_at: string;
  updated_at: string;
}

interface DocumentVersion {
  id: string;
  version_number: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  change_note: string | null;
  uploader: UserSummary;
  created_at: string;
}

// types/folder.ts
interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  is_system: boolean;
  children: Folder[];
  document_count: number;
}

// types/approval.ts
interface Approval {
  id: string;
  document: DocumentSummary;
  requester: UserSummary;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  steps: ApprovalStep[];
  created_at: string;
  completed_at: string | null;
}

interface ApprovalStep {
  id: string;
  approver: UserSummary;
  step_order: number;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  acted_at: string | null;
}

// types/api.ts
interface ApiResponse<T> {
  data: T;
}

interface ApiListResponse<T> {
  data: T[];
  total: number;
}

interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
```

### 6.3 TanStack Query 키 구조

```typescript
const queryKeys = {
  documents: {
    all: ['documents'] as const,
    list: (params: DocumentListParams) => ['documents', 'list', params] as const,
    detail: (id: string) => ['documents', 'detail', id] as const,
    versions: (id: string) => ['documents', 'versions', id] as const,
  },
  folders: {
    all: ['folders'] as const,
    tree: () => ['folders', 'tree'] as const,
    detail: (id: string) => ['folders', 'detail', id] as const,
  },
  approvals: {
    all: ['approvals'] as const,
    list: (params: ApprovalListParams) => ['approvals', 'list', params] as const,
    detail: (id: string) => ['approvals', 'detail', id] as const,
  },
  search: (params: SearchParams) => ['search', params] as const,
};
```

### 6.4 사용자 흐름

```
[로그인 흐름]
/login → 이메일/비밀번호 입력 → POST /api/auth/login
  → 성공: 토큰 저장 (httpOnly cookie) → / (대시보드) 리다이렉트
  → 실패: 에러 메시지 표시

[문서 업로드 흐름]
/documents/upload → 파일 드래그 또는 선택 → 메타정보 입력 (제목, 설명, 태그, 폴더)
  → POST /api/documents (multipart) → 프로그레스 바 표시
  → 성공: /documents/[id] 리다이렉트
  → 실패: 에러 토스트

[결재 흐름]
/documents/[id] → "결재 요청" 버튼 → 결재선 설정 다이얼로그
  → 결재자 검색/선택 (최대 3단계) → POST /api/approvals
  → 결재자: /approvals 목록에서 확인 → 문서 검토 → 승인/반려
```

---

## 7. 에러 처리

### 7.1 에러 코드 정의

| HTTP | Code | 메시지 | 대응 |
|------|------|--------|------|
| 400 | VALIDATION_ERROR | 입력값 검증 실패 | 필드별 에러 메시지 표시 |
| 400 | FILE_TOO_LARGE | 파일 크기 초과 (50MB) | 파일 크기 제한 안내 |
| 400 | UNSUPPORTED_FILE_TYPE | 미지원 파일 형식 | 허용 파일 형식 안내 |
| 401 | UNAUTHORIZED | 인증 실패 | 로그인 페이지 리다이렉트 |
| 401 | TOKEN_EXPIRED | 토큰 만료 | 리프레시 토큰으로 갱신 시도 |
| 403 | FORBIDDEN | 권한 없음 | 권한 부족 안내 |
| 404 | NOT_FOUND | 리소스 없음 | 404 페이지 표시 |
| 409 | ALREADY_EXISTS | 중복 데이터 | 중복 내용 안내 |
| 409 | APPROVAL_CONFLICT | 이미 처리된 결재 | 새로고침 유도 |
| 500 | INTERNAL_ERROR | 서버 에러 | 에러 로깅 + 일반 에러 메시지 |

### 7.2 프론트엔드 에러 처리 전략

```typescript
// lib/api/client.ts - Axios 인터셉터
// 401 → 토큰 리프레시 → 실패 시 로그인 리다이렉트
// 403 → 권한 없음 토스트
// 500 → 일반 에러 토스트
```

---

## 8. 보안 설계

- [x] 비밀번호: bcrypt 해싱 (cost=12)
- [x] JWT: HS256 서명, httpOnly 쿠키 저장 (XSS 방지)
- [x] CSRF: SameSite=Strict 쿠키 + Origin 검증
- [x] 입력 검증: Go 서버 측 Gin binding 태그 + 프론트 Zod
- [x] SQL Injection: sqlc 파라미터 바인딩으로 원천 차단
- [x] XSS: React 기본 이스케이프 + 사용자 HTML 입력 차단
- [x] 파일 업로드: MIME 타입 화이트리스트, 파일명 UUID 치환
- [x] 멀티테넌시: PostgreSQL RLS로 테넌트간 데이터 격리
- [x] Rate Limiting: Gin 미들웨어 (로그인: 5회/분, API: 100회/분)
- [x] CORS: 허용 오리진 명시적 설정

---

## 9. 테스트 계획

### 9.1 테스트 범위

| 유형 | 대상 | 도구 |
|------|------|------|
| 단위 테스트 (Go) | Service 레이어 비즈니스 로직 | Go testing + testify |
| 통합 테스트 (Go) | API 엔드포인트, DB 쿼리 | httptest + testcontainers |
| 단위 테스트 (FE) | 유틸 함수, 커스텀 훅 | Vitest + React Testing Library |
| E2E 테스트 | 주요 사용자 시나리오 | Playwright |

### 9.2 핵심 테스트 케이스

- [ ] 회원가입 → 로그인 → 토큰 발급 성공
- [ ] 문서 업로드 → 버전 1 생성 확인
- [ ] 문서 새 버전 업로드 → version_number 자동 증가
- [ ] 결재 요청 → 순차 승인 → 최종 완료
- [ ] 결재 반려 → 사유 필수 검증
- [ ] 다른 테넌트 문서 접근 시 403 반환
- [ ] 50MB 초과 파일 업로드 시 400 반환
- [ ] 소프트 삭제 후 휴지통에서 복원

---

## 10. 코딩 컨벤션

### 10.1 백엔드 (Go)

| 대상 | 규칙 | 예시 |
|------|------|------|
| 패키지 | 소문자 단일 단어 | `handler`, `service`, `repository` |
| 파일명 | snake_case | `document_handler.go` |
| 구조체 | PascalCase | `DocumentService` |
| 인터페이스 | PascalCase + er 접미사 | `Storage`, `DocumentRepository` |
| 메서드 | PascalCase (public) | `Create`, `GetByID` |
| 에러 변수 | Err 접두사 | `ErrNotFound`, `ErrUnauthorized` |

### 10.2 프론트엔드 (TypeScript)

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `DocumentList.tsx` |
| 훅 | camelCase, use 접두사 | `useDocuments.ts` |
| 유틸 | camelCase | `formatDate.ts` |
| 타입 | PascalCase | `Document`, `ApiResponse` |
| 폴더 | kebab-case | `components/documents/` |
| 상수 | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| API 함수 | camelCase, 동사 시작 | `getDocuments`, `createDocument` |

### 10.3 환경 변수

| 변수 | 용도 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 | `postgres://user:pass@localhost:5432/docflow` |
| `JWT_SECRET` | JWT 서명 키 | `random-secret-key` |
| `STORAGE_TYPE` | 스토리지 종류 | `local` / `s3` |
| `STORAGE_PATH` | 로컬 저장 경로 | `./uploads` |
| `AWS_S3_BUCKET` | S3 버킷명 | `docflow-files` |
| `NEXT_PUBLIC_API_URL` | 프론트 API URL | `http://localhost:8080` |

---

## 11. 구현 순서

### Phase 1: 기초 (MVP)
1. [ ] 인프라 초기화 (Docker Compose: Go + PostgreSQL + Next.js)
2. [ ] DB 마이그레이션 (tenants, users 테이블)
3. [ ] sqlc 설정 + 쿼리 작성
4. [ ] 인증 API (register, login, JWT 미들웨어)
5. [ ] 프론트 인증 (로그인/회원가입 페이지, 토큰 관리)
6. [ ] 폴더 CRUD API + 프론트 폴더트리
7. [ ] 문서 업로드/다운로드 API + 프론트 업로드 폼
8. [ ] 문서 목록/상세 페이지

### Phase 2: 핵심 기능
9. [ ] 문서 미리보기 (PDF: react-pdf, 이미지: 인라인)
10. [ ] 문서 검색 API (PostgreSQL 전문검색) + 프론트 검색 UI
11. [ ] 버전 관리 API + 버전 이력 타임라인 UI

### Phase 3: 워크플로우
12. [ ] 결재 API (생성, 승인, 반려, 취소)
13. [ ] 결재 UI (목록, 상세, 결재선 시각화)
14. [ ] 즐겨찾기, 휴지통 기능

### Phase 4: 관리 및 고도화
15. [ ] 사용자 관리 (관리자 전용)
16. [ ] 대시보드 (최근 문서, 결재 대기, 통계)

---

## Version History

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-03-22 | 초안 작성 | seosangjun |
