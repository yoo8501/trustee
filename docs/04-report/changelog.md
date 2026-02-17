# Changelog

모든 주요 피처의 완료 이력과 변경사항을 기록합니다.

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
