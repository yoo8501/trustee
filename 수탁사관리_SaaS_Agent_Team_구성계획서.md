# 수탁사 관리 SaaS 프로젝트 — AI Agent Team 구성 계획서

> 개인정보 처리 위탁 관리 자동화를 위한 에이전트 팀 설계

---

## 1. 프로젝트 개요

개인정보보호법에 따라 위탁사는 수탁사에 대한 관리·감독 의무를 가진다. 본 SaaS 플랫폼은 수탁사 등록, 위탁계약 관리, 정기 점검(자가점검 설문), 스코어링, 보고서 생성까지의 전 과정을 자동화하여 위탁사의 컴플라이언스 부담을 최소화한다.

1인 개발자가 Claude Code 기반의 AI 에이전트 팀을 오케스트레이션하여 개발을 진행하며, 각 에이전트는 독립된 전문 컨텍스트를 바탕으로 자기 영역의 산출물을 생성한다.

---

## 2. 에이전트 팀 구성 요약

| # | 에이전트 | Phase | 핵심 역할 |
|---|---------|-------|----------|
| 1 | 🔒 개인정보보호 전문가 | Phase 0 — 기반 수립 | 법령 분석, 점검 체크리스트, 스코어링 기준 정의 |
| 2 | 🎨 디자인 | Phase 0 — 기반 수립 | 디자인 시스템, 화면별 UI/UX 설계, 컴포넌트 가이드 |
| 3 | 🏗️ 아키텍트 | Phase 1 — 설계 | ERD/스키마, API 스펙, 아키텍처 결정 문서(ADR) |
| 4 | ⚙️ 구현 (풀스택) | Phase 2 — 구현 | 백엔드 API + 프론트엔드 UI 구현 |
| 5 | ✅ 검증 (QA) | Phase 3 — 검증 | 코드 리뷰, 테스트, 컴플라이언스 검증 |

---

## 3. Phase별 실행 흐름

```
Phase 0: 도메인 + 디자인 기반 수립 (병렬)
  ├── 개인정보보호 전문가 Agent ──┐
  └── 디자인 Agent ──────────────┤
                                  ↓ 산출물
Phase 1: 시스템 설계
  └── 아키텍트 Agent
                                  ↓ 산출물
Phase 2: 구현
  └── 구현 Agent (풀스택)
                                  ↓ 산출물
Phase 3: 검증
  └── 검증 Agent (QA)
```

### Phase 0 — 도메인 + 디자인 기반 수립

시스템 설계에 앞서 "무엇을 만들어야 하는지"를 정의하는 단계. 개인정보보호 전문가 Agent와 디자인 Agent가 **병렬**로 동작하여 도메인 요구사항과 UI/UX 기준을 확정한다.

### Phase 1 — 시스템 설계

Phase 0의 산출물을 입력으로 받아, 아키텍트 Agent가 기술적 설계를 확정한다. 이 단계의 산출물이 이후 모든 에이전트의 공유 컨텍스트가 된다.

### Phase 2 — 구현

확정된 설계를 바탕으로 구현 Agent가 백엔드와 프론트엔드를 개발한다. MVP 단계에서는 단일 풀스택 에이전트로 운영하며, 규모 확장 시 백엔드/프론트엔드로 분리한다.

### Phase 3 — 검증

구현 결과물에 대한 코드 품질, 테스트 커버리지, 컴플라이언스 적합성, UI 일관성을 종합 검증한다.

---

## 4. 에이전트 상세 정의

### 4.1 🔒 개인정보보호 전문가 Agent

> 법령 기반 도메인 지식의 원천 — 모든 기능 요구사항의 법적 근거를 제공

**주요 책임**

- 개인정보보호법·시행령·고시에서 위탁 관련 조항 추출 및 분류 (법정 필수 vs 권고사항)
- 점검 체크리스트 항목 설계 — 항목별 법적 근거 매핑 및 위험도 가중치 기준 제시
- 스코어링/등급 산정 비즈니스 룰 정의 (예: 필수 항목 미이행 시 등급 제한)
- 위탁계약서 법정 필수 포함 조항 정리
- 자동 생성 보고서 템플릿의 법적 적합성 감수
- 법령 개정 시 영향 범위 분석

**산출물**

| 파일 | 내용 |
|------|------|
| `legal-requirements.md` | 법령별 위탁 관련 조항 정리 |
| `checklist-spec.md` | 점검 항목 + 법적 근거 + 가중치 |
| `scoring-rules.md` | 등급 산정 비즈니스 룰 |
| `contract-clauses.md` | 위탁계약 필수 포함 조항 |
| `report-requirements.md` | 보고서 필수 포함 내용 |

**컨텍스트 경로**

```
docs/compliance/
  ├── legal-requirements.md
  ├── checklist-spec.md
  ├── scoring-rules.md
  ├── contract-clauses.md
  └── report-requirements.md
```

---

### 4.2 🎨 디자인 Agent

> SaaS 제품의 시각적 신뢰도와 사용자 경험 설계 담당

**주요 책임**

- 디자인 시스템 정의 — 컬러, 타이포그래피, 스페이싱, Tailwind 토큰
- 컴포넌트 가이드 — 버튼, 카드, 테이블, 폼, 모달 등 UI 컴포넌트 스펙
- 화면별 UI 설계 — 위탁사 대시보드, 수탁사 점검 응답 화면, 보고서 뷰
- UX 플로우 — 위탁사/수탁사 각각의 사용자 여정 설계
- 반응형 기준 — 데스크톱(위탁사) + 모바일(수탁사 응답) 대응
- 엣지 케이스 UI — 에러, 빈 상태, 로딩, 권한 없음 등

**산출물**

| 파일 | 내용 |
|------|------|
| `design-system.md` | 컬러/타이포/스페이싱/Tailwind 토큰 |
| `component-guide.md` | 컴포넌트별 HTML 구조 + 스타일 |
| `screen-specs/` | 화면별 와이어프레임 및 레이아웃 스펙 |
| `ux-flows.md` | 사용자 여정 플로우 |

**컨텍스트 경로**

```
docs/design/
  ├── design-system.md
  ├── component-guide.md
  ├── screen-specs/
  │     ├── dashboard.md
  │     ├── inspection-form.md
  │     └── report-view.md
  └── ux-flows.md
```

---

### 4.3 🏗️ 아키텍트 Agent

> Phase 0 산출물을 기술적 시스템 설계로 통합 — 구현의 기준점

**주요 책임**

- ERD 및 Prisma 스키마 설계
- API 스펙 정의 (OpenAPI/REST)
- 아키텍처 결정 문서(ADR) 작성 — 기술 스택, 인증 방식, 멀티테넌시 전략 등
- 공유 타입 및 상수 정의
- 디자인 Agent의 UI 스펙과 백엔드 API 간 인터페이스 정합성 확보

**산출물**

| 파일 | 내용 |
|------|------|
| `schema.prisma` | 데이터베이스 스키마 |
| `api-spec.yaml` | API 엔드포인트 스펙 |
| `ADRs/` | 아키텍처 결정 기록 |
| `shared/types.ts` | 공유 타입 정의 |

**컨텍스트 경로**

```
docs/architecture/
  ├── schema.prisma
  ├── api-spec.yaml
  └── ADRs/
packages/shared/
  └── types.ts

# 참조 (Phase 0 산출물)
docs/compliance/*
docs/design/*
```

---

### 4.4 ⚙️ 구현 Agent (풀스택)

> 확정된 설계를 실제 동작하는 코드로 구현 — 백엔드 + 프론트엔드 통합

**주요 책임**

- 백엔드: API 엔드포인트 구현, 비즈니스 로직, DB 쿼리
- 프론트엔드: 디자인 스펙 기반 UI 구현, 상태 관리, API 연동
- 점검 엔진: 설문 발송/수집, 자동 스코어링, 보완요청 워크플로
- 보고서 생성: PDF/엑셀 자동 출력
- 수탁사 온보딩: 토큰 기반 비로그인 접근, 설문 응답 UI

**산출물**

```
packages/backend/   — API 서버 코드
packages/frontend/  — 클라이언트 코드
packages/shared/    — 공유 유틸리티
```

**컨텍스트 경로**

```
packages/backend/CLAUDE.md
packages/frontend/CLAUDE.md

# 참조
docs/architecture/*          (Phase 1 산출물)
docs/design/*                (Phase 0 산출물)
docs/compliance/scoring-rules.md  (스코어링 로직)
```

---

### 4.5 ✅ 검증 (QA) Agent

> 전체 산출물의 품질과 적합성을 종합 검증

**주요 책임**

- 코드 리뷰: 코딩 컨벤션, 보안 취약점, 성능 이슈 확인
- 테스트 작성: 단위 테스트, 통합 테스트, E2E 테스트 (Playwright)
- 컴플라이언스 검증: 점검 항목이 법적 요구사항을 정확히 반영하는지 확인
- UI 일관성 검증: 디자인 시스템 준수 여부 확인
- 보고서 출력 검증: 자동 생성 보고서의 포맷 및 내용 적합성

**산출물**

| 파일 | 내용 |
|------|------|
| 테스트 코드 | 단위/통합/E2E 테스트 |
| 검증 보고서 | 코드 리뷰 및 컴플라이언스 체크 결과 |

**컨텍스트 경로**

```
# Cross-cutting — 모든 Phase의 산출물 참조
docs/compliance/*            (컴플라이언스 기준)
docs/design/design-system.md (UI 일관성 기준)
docs/architecture/*          (설계 준수 여부)
packages/backend/
packages/frontend/
```

---

## 5. 프로젝트 컨텍스트 구조

에이전트 간 소통은 코드와 문서로 이루어진다. 아래 디렉토리 구조가 공유 컨텍스트 역할을 한다.

```
프로젝트 루트/
├── CLAUDE.md                    ← 프로젝트 전체 원칙, 코딩 컨벤션
│
├── docs/
│   ├── compliance/              ← 개인정보보호 전문가 Agent 산출물
│   │   ├── legal-requirements.md
│   │   ├── checklist-spec.md
│   │   ├── scoring-rules.md
│   │   ├── contract-clauses.md
│   │   └── report-requirements.md
│   │
│   ├── design/                  ← 디자인 Agent 산출물
│   │   ├── design-system.md
│   │   ├── component-guide.md
│   │   ├── screen-specs/
│   │   └── ux-flows.md
│   │
│   └── architecture/            ← 아키텍트 Agent 산출물
│       ├── schema.prisma
│       ├── api-spec.yaml
│       └── ADRs/
│
├── packages/
│   ├── backend/                 ← 백엔드 코드 + 전용 CLAUDE.md
│   ├── frontend/                ← 프론트엔드 코드 + 전용 CLAUDE.md
│   └── shared/                  ← 공유 타입, 상수, 유틸리티
```

---

## 6. 운영 원칙

### 6.1 에이전트 간 의존성

각 에이전트는 이전 Phase의 산출물을 컨텍스트로 참조한다. Architect Agent의 산출물 품질이 전체 프로젝트 품질을 좌우하며, 그 입력 품질은 Phase 0의 두 에이전트에 의해 결정된다.

### 6.2 MVP 운영 전략

- **Phase 0**: 개인정보보호 전문가와 디자인 Agent를 병렬로 실행하여 시간 절약
- **Phase 2**: 구현 Agent를 단일 풀스택으로 운영. 규모가 커지면 백엔드/프론트엔드로 분리하고, 도메인별(점검 엔진, 계약 관리 등)로 추가 세분화
- **에이전트 수**: 1인 개발에서 에이전트가 5개를 넘으면 오케스트레이션 비용이 개발 비용을 초과. 현재 5개 구성이 적정선

### 6.3 컨텍스트 관리 원칙

- **문서 기반 소통**: 에이전트끼리 직접 대화하지 않는다. 산출물 문서가 인터페이스다.
- **컨텍스트 계층**: 루트 CLAUDE.md → 도메인별 docs/ → 패키지별 CLAUDE.md 순으로 계층화
- **변경 전파**: 상위 Phase 산출물이 변경되면 하위 Phase에 영향이 전파되므로, Phase 0~1의 산출물은 가급적 조기에 확정
