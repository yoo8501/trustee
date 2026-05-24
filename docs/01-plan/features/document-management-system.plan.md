# Plan: DocFlow - 문서관리시스템 (Document Management System)

> **Feature**: document-management-system
> **Project**: DocFlow
> **Created**: 2026-03-22
> **Status**: Draft
> **Level**: Dynamic

---

## 1. 개요

### 1.1 목적
회사 내부에서 문서를 체계적으로 관리할 수 있는 웹 기반 문서관리시스템(DMS)을 구축한다.
문서의 생성부터 결재, 보관, 검색까지 전체 라이프사이클을 관리한다.

### 1.2 배경
- 회사 내 문서가 개인 PC, 이메일, 메신저 등에 분산 보관되어 관리가 어려움
- 문서 버전 혼란으로 최신 문서 식별이 어려움
- 문서 결재/승인 프로세스의 디지털화 필요

### 1.3 범위
| 포함 | 제외 |
|------|------|
| 문서 업로드/다운로드/미리보기 | 실시간 공동 편집 (Google Docs 수준) |
| 폴더 기반 분류 체계 | 외부 시스템 연동 (ERP, 그룹웨어) |
| 문서 제목/내용 검색 | 모바일 전용 앱 |
| 버전 관리 (이력/복원) | OCR 기반 문서 텍스트 추출 |
| 결재/승인 워크플로우 | 전자서명/인감 |
| 사용자 인증 및 권한 관리 | |

---

## 2. 사용자 및 권한

### 2.1 사용자 유형

| 역할 | 설명 | 주요 권한 |
|------|------|----------|
| **관리자** (admin) | 시스템 전체 관리자 | 모든 문서 접근, 사용자 관리, 폴더 관리, 시스템 설정 |
| **일반 사용자** (user) | 일반 직원 | 자기 문서 CRUD, 공유 문서 열람, 결재 요청/승인 |

### 2.2 권한 매트릭스

| 기능 | 관리자 | 일반 사용자 |
|------|--------|------------|
| 문서 업로드 | ✅ | ✅ (자기 폴더/공유 폴더) |
| 문서 다운로드 | ✅ 전체 | ✅ 권한 있는 문서만 |
| 문서 삭제 | ✅ 전체 | ✅ 자기 문서만 |
| 폴더 생성/관리 | ✅ 전체 | ✅ 자기 폴더/하위 폴더 |
| 결재 요청 | ✅ | ✅ |
| 결재 승인/반려 | ✅ | ✅ (결재선에 포함된 경우) |
| 사용자 관리 | ✅ | ❌ |
| 시스템 설정 | ✅ | ❌ |

---

## 3. 핵심 기능 상세

### 3.1 문서 업로드/다운로드/미리보기

**업로드**
- 드래그 앤 드롭 또는 파일 선택으로 업로드
- 다중 파일 동시 업로드 지원
- 업로드 시 제목, 설명, 카테고리 태그 입력
- 파일 크기 제한: 50MB (설정 가능)
- 허용 파일 형식: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, HWP, JPG/PNG, ZIP

**다운로드**
- 단일/다중 파일 다운로드
- 다중 선택 시 ZIP 압축 다운로드

**미리보기**
- PDF: 브라우저 내장 뷰어
- 이미지(JPG/PNG): 인라인 미리보기
- Office 문서: 첫 페이지 썸네일 생성 (서버사이드)
- 미리보기 불가 파일: 파일 정보 + 다운로드 버튼 표시

### 3.2 폴더/카테고리 분류 + 검색

**폴더 구조**
- 트리형 폴더 구조 (무제한 깊이, 권장 3~4단계)
- 기본 폴더: 내 문서, 공유 문서, 결재 문서, 휴지통
- 폴더 생성/이름변경/이동/삭제
- 폴더별 접근 권한 설정 (관리자)

**검색**
- 문서 제목 검색
- 문서 설명/태그 검색
- 작성자, 날짜 범위, 파일 유형 필터
- 최근 문서, 즐겨찾기 바로가기

### 3.3 버전 관리

- 동일 문서 수정 시 자동 버전 증가 (v1 → v2 → v3)
- 버전별 파일 보관 및 열람
- 이전 버전으로 복원 기능
- 버전 간 변경 사유 입력
- 버전 이력 타임라인 표시

### 3.4 결재/승인 워크플로우

**결재 프로세스**
```
상신(요청) → 검토 중 → 승인/반려 → 완료
```

**상세 흐름**
1. 문서 작성자가 결재 요청 (결재자 지정)
2. 결재자에게 알림 표시
3. 결재자가 문서 검토 후 승인 또는 반려
4. 반려 시 사유 입력 필수, 작성자에게 알림
5. 승인 시 문서 상태가 '승인됨'으로 변경

**결재선**
- 단일 결재자 또는 순차 결재 (최대 3단계)
- 결재선: 작성자 → 검토자 → 최종승인자

---

## 4. 페이지 구성

### 4.1 페이지 목록

| 페이지 | 경로 | 설명 |
|--------|------|------|
| 로그인 | `/login` | 이메일/비밀번호 로그인 |
| 회원가입 | `/register` | 이름, 이메일, 비밀번호 |
| 대시보드 | `/` | 최근 문서, 결재 대기, 즐겨찾기 |
| 문서 목록 | `/documents` | 전체 문서 목록 (그리드/리스트 뷰) |
| 문서 상세 | `/documents/[id]` | 문서 미리보기, 버전 이력, 메타정보 |
| 문서 업로드 | `/documents/upload` | 파일 업로드 + 메타정보 입력 |
| 폴더 탐색 | `/folders/[id]` | 폴더 트리 + 문서 목록 |
| 결재 목록 | `/approvals` | 결재 요청/대기/완료 탭 |
| 결재 상세 | `/approvals/[id]` | 결재 문서 상세 + 승인/반려 |
| 검색 결과 | `/search` | 통합 검색 결과 |
| 휴지통 | `/trash` | 삭제된 문서 목록, 복원/영구삭제 |
| 사용자 관리 | `/admin/users` | (관리자) 사용자 목록/권한 관리 |
| 내 정보 | `/profile` | 프로필 수정, 비밀번호 변경 |

### 4.2 공통 레이아웃
- **사이드바**: 폴더 트리 네비게이션, 즐겨찾기, 휴지통
- **헤더**: 검색바, 알림 아이콘, 사용자 메뉴
- **메인**: 문서 목록 또는 상세 콘텐츠

---

## 5. 프로젝트 구조

```
docflow/
├── frontend/          # Next.js 15 (App Router)
│   ├── src/
│   │   ├── app/       # 페이지 (App Router)
│   │   ├── components/# UI 컴포넌트
│   │   ├── hooks/     # 커스텀 훅
│   │   ├── lib/       # 유틸리티, API 클라이언트
│   │   └── types/     # TypeScript 타입 정의
│   ├── public/
│   ├── package.json
│   └── next.config.ts
│
├── backend/           # Go + Gin API 서버
│   ├── cmd/
│   │   └── server/    # 엔트리포인트 (main.go)
│   ├── internal/
│   │   ├── handler/   # HTTP 핸들러 (컨트롤러)
│   │   ├── service/   # 비즈니스 로직
│   │   ├── repository/# DB 접근 (sqlc 생성 코드)
│   │   ├── middleware/ # 인증, CORS, 로깅 등
│   │   ├── model/     # 도메인 모델
│   │   └── storage/   # 파일 스토리지 인터페이스
│   ├── db/
│   │   ├── migrations/# golang-migrate 마이그레이션 파일
│   │   ├── queries/   # sqlc SQL 쿼리 파일
│   │   └── sqlc.yaml  # sqlc 설정
│   ├── go.mod
│   └── go.sum
│
├── infra/             # 인프라 설정
│   ├── docker/        # Dockerfile, docker-compose
│   ├── nginx/         # 리버스 프록시 설정
│   ├── scripts/       # 배포/초기화 스크립트
│   └── terraform/     # (추후) 클라우드 인프라 IaC
│
├── docs/              # PDCA 문서
├── CLAUDE.md
└── README.md
```

---

## 6. 데이터 모델 (초안)

> SaaS 멀티테넌시: 모든 핵심 테이블에 tenant_id 포함, PostgreSQL RLS로 격리

### 6.1 주요 엔티티

```
User (사용자)
├── id, email, password, name, role, createdAt, updatedAt

Folder (폴더)
├── id, name, parentId, ownerId, isSystem, sortOrder, createdAt, updatedAt
├── 1:N → Folder (하위 폴더, self-relation)
└── 1:N → Document

Document (문서)
├── id, title, description, folderId, uploaderId, currentVersionId
├── status (draft/active/archived/deleted), tags, isFavorite
├── createdAt, updatedAt, deletedAt
├── 1:N → DocumentVersion
└── 1:N → Approval

DocumentVersion (문서 버전)
├── id, documentId, versionNumber, fileName, fileSize, mimeType
├── storagePath, changeNote, uploaderId
└── createdAt

Approval (결재)
├── id, documentId, requesterId, status (pending/approved/rejected/cancelled)
├── createdAt, updatedAt, completedAt
└── 1:N → ApprovalStep

ApprovalStep (결재 단계)
├── id, approvalId, approverId, stepOrder, status (pending/approved/rejected)
├── comment, actionAt
└── N:1 → User (approverId)
```

### 6.2 관계도 요약

```
User ──┬── 1:N → Document (uploader)
       ├── 1:N → Folder (owner)
       ├── 1:N → Approval (requester)
       └── 1:N → ApprovalStep (approver)

Folder ──┬── 1:N → Folder (parent-child)
         └── 1:N → Document

Document ──┬── 1:N → DocumentVersion
           └── 1:N → Approval

Approval ── 1:N → ApprovalStep
```

---

## 7. 기술 스택

### 7.1 아키텍처 개요

```
[SaaS 아키텍처]

퍼블릭 영역 (SSR/SSG)          앱 영역 (CSR)
┌─────────────────┐     ┌──────────────────────┐
│ / (랜딩)         │     │ /app/dashboard       │
│ /pricing        │     │ /app/documents       │
│ /features       │     │ /app/approvals       │
│ /login, /signup │     │ /app/settings        │
└────────┬────────┘     └──────────┬───────────┘
         │                         │
         └─────────┬───────────────┘
                   ▼
            Go API 서버 (Gin)
                   │
              PostgreSQL
         (멀티테넌시 RLS)
```

### 7.2 기술 스택 상세

| 구분 | 기술 | 비고 |
|------|------|------|
| **Backend** | Go + Gin | REST API 서버 |
| **DB** | PostgreSQL | 멀티테넌시 RLS, 전문검색, JSONB |
| **DB 접근** | sqlc + golang-migrate | SQL → Go 코드 자동생성, 마이그레이션 |
| **Frontend** | Next.js 15 (App Router) | TypeScript, SSR(퍼블릭) + CSR(앱) |
| **UI** | MUI (Material-UI) | 업무용 컴포넌트 |
| **상태관리** | TanStack Query (React Query) | 서버 상태 |
| **폼 관리** | React Hook Form + Zod | 유효성 검증 |
| **인증** | Go 서버 JWT 직접 구현 | 멀티테넌시 조직 관리 유연성 |
| **파일 저장** | 로컬 스토리지 → AWS S3 전환 | 스토리지 인터페이스 추상화 |
| **파일 미리보기** | react-pdf, 이미지 내장 뷰어 | |

---

## 8. API 엔드포인트 (초안)

### 8.1 인증
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 (JWT) |
| POST | `/api/auth/logout` | 로그아웃 |

### 8.2 문서
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/documents` | 문서 목록 (필터/검색/페이징) |
| GET | `/api/documents/[id]` | 문서 상세 |
| POST | `/api/documents` | 문서 업로드 |
| PATCH | `/api/documents/[id]` | 문서 정보 수정 |
| DELETE | `/api/documents/[id]` | 문서 삭제 (소프트) |
| POST | `/api/documents/[id]/restore` | 휴지통 복원 |
| POST | `/api/documents/[id]/favorite` | 즐겨찾기 토글 |

### 8.3 버전
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/documents/[id]/versions` | 버전 목록 |
| POST | `/api/documents/[id]/versions` | 새 버전 업로드 |
| POST | `/api/documents/[id]/versions/[versionId]/restore` | 버전 복원 |
| GET | `/api/documents/[id]/versions/[versionId]/download` | 버전 다운로드 |

### 8.4 폴더
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/folders` | 폴더 트리 |
| GET | `/api/folders/[id]` | 폴더 상세 + 문서 목록 |
| POST | `/api/folders` | 폴더 생성 |
| PATCH | `/api/folders/[id]` | 폴더 수정/이동 |
| DELETE | `/api/folders/[id]` | 폴더 삭제 |

### 8.5 결재
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/approvals` | 결재 목록 (요청/대기/완료) |
| GET | `/api/approvals/[id]` | 결재 상세 |
| POST | `/api/approvals` | 결재 요청 |
| POST | `/api/approvals/[id]/approve` | 승인 |
| POST | `/api/approvals/[id]/reject` | 반려 |
| POST | `/api/approvals/[id]/cancel` | 결재 취소 |

### 8.6 사용자 관리
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/users` | 사용자 목록 (관리자) |
| PATCH | `/api/users/[id]` | 사용자 정보/역할 수정 |
| GET | `/api/users/me` | 내 정보 |
| PATCH | `/api/users/me` | 내 정보 수정 |

### 8.7 검색
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/search` | 통합 검색 (제목, 설명, 태그) |

---

## 9. 구현 우선순위

### Phase 1: 기초 (MVP)
1. 프로젝트 초기화 (frontend: Next.js+MUI, backend: Go+Gin+sqlc, infra: Docker)
2. 인증 (로그인/회원가입)
3. 폴더 관리 (CRUD, 트리 구조)
4. 문서 업로드/다운로드/목록

### Phase 2: 핵심 기능
5. 문서 미리보기 (PDF, 이미지)
6. 문서 검색 + 필터
7. 버전 관리

### Phase 3: 워크플로우
8. 결재/승인 프로세스
9. 알림 시스템 (인앱 알림)
10. 즐겨찾기, 휴지통

### Phase 4: 관리 및 고도화
11. 사용자 관리 (관리자)
12. 대시보드
13. UI/UX 고도화

---

## 10. 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 성능 | 문서 목록 로딩 2초 이내, 파일 업로드 프로그레스 표시 |
| 보안 | 비밀번호 bcrypt 해싱, JWT 기반 세션, CSRF 방지 |
| 확장성 | 파일 스토리지 추상화 (로컬 → S3 전환 용이) |
| 접근성 | 키보드 네비게이션, 스크린리더 기본 지원 |
| 브라우저 | Chrome, Edge, Safari 최신 2개 버전 |

---

## 11. 리스크 및 고려사항

| 리스크 | 대응 방안 |
|--------|----------|
| 대용량 파일 업로드 시 타임아웃 | 청크 업로드 방식 고려, 파일 크기 제한 설정 |
| 동시 편집 충돌 | 동시 편집 미지원, 버전 관리로 대체 |
| 파일 스토리지 용량 | 로컬 스토리지 모니터링, S3 전환 로드맵 |
| 검색 성능 | DB 인덱스 최적화, 추후 Elasticsearch 고려 |
