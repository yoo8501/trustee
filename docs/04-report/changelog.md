# Changelog

모든 주요 피처의 완료 이력과 변경사항을 기록합니다.

---

## [2026-02-20] - 체크리스트 검토/반려 플로우 완료

### Added
- 반려 처리 기능
  - POST `/api/trustee-checklists/:id/reject`: 항목별 반려/승인 + 새 기한 설정
  - 반려 다이얼로그: 항목별 체크박스 + 사유 입력
  - 위탁사 UI: RejectDialog, DiffView
  - 수탁사 UI: 반려 상태 표시 및 사유 확인
- 변경사항 비교 (Diff) 기능
  - GET `/api/trustee-checklists/:id/diff`: 스냅샷 기반 변경사항 비교
  - ChecklistSnapshot 모델: 제출 시점 JSON 스냅샷
  - DiffView: 노란색 하이라이트 + 이전값 → 현재값 표시
- 검토 이력 추적
  - GET `/api/trustee-checklists/:id/reviews`: 위탁사 검토 이력
  - GET `/api/checklist-response/:token/reviews`: 수탁사 반려 사유
  - ItemReview 모델: 항목별 검토 결과 저장
- 5개 React Query 훅: useRejectChecklist, useReviewChecklist, useChecklistDiff, useChecklistReviews, useChecklistResponseReviews

### Changed
- TrusteeChecklistStatus enum: `rejected` 상태 추가
- TrusteeChecklist 모델: `reviewRound` 필드 추가
- ChecklistResponseService.validateEditable(): rejected 상태 편집 허용
- ChecklistResponseService.submit(): 스냅샷 자동 생성

### Fixed
- 반려 시 기한 재설정: `accessTokenExpiresAt` 업데이트
- 토큰 재사용: 기존 링크 유지, 기한만 변경
- 반려 상태에서 재편집 가능: 기한 내 수정 허용

### Details
- **Match Rate**: 100% (91/91 항목)
- **Iteration Count**: 0 (첫 분석에서 완벽)
- **Architecture Compliance**: 100%
- **Convention Compliance**: 100%
- **완료 보고서**: docs/04-report/features/checklist-review-rejection.report.md

---

## [2026-02-17] - Design System 완료

### Added
- 디자인 토큰 시스템 (tokens.ts): 100+ 토큰 정의
  - 색상 (39개): brand, background, foreground, border, link, overlay, header, scrollbar
  - 타이포그래피: fontFamily, fontSize, fontWeight
  - 간격, 라디우스, 그림자, 애니메이션 토큰
- 신규 컴포넌트 7개: StatusBadge, SearchInput, EmptyState, PageHeader, StatCard, IconButton, Kbd
- 폼 확장: FormCheckbox, FormRadioGroup
- 쇼케이스 페이지 (16개 섹션): http://localhost:3000/design-system
- MUI 테마 override (30+ 컴포넌트)

### Changed
- 기존 컴포넌트 5개 리스타일
  - Button: size variant 추가
  - DataTable: 다크 스타일 + 빈 상태
  - Dialog: 다크 모달 스타일
  - Form: 폼 확장
  - Layout: Linear 스타일 사이드바
- 테마 전환: Light → Dark
- @trustee/ui index.ts: 18개 MUI 컴포넌트 re-export 추가

### Fixed
- 미들웨어: /design-system 공개 경로 추가

### Details
- **총 파일 변경**: 17개 (신규 9 + 수정 8)
- **컴포넌트**: 14개 구현
- **Match Rate**: 96% (목표 90% 달성)
- **TypeScript 검사**: PASS
- **완료 보고서**: docs/04-report/features/design-system.report.md
