# Gap Analysis: user-authentication

> **Feature**: user-authentication (사용자 인증 및 권한 관리)
> **Date**: 2026-03-22
> **Match Rate**: 93%
> **Status**: Pass (>= 90%)

---

## 전체 점수 요약

| 카테고리 | 점수 | 상태 |
|----------|:----:|:----:|
| 데이터 모델 (Section 3) | 88% | ⚠️ |
| API 상세 설계 (Section 4) | 95% | ✅ |
| 백엔드 상세 설계 (Section 5) | 95% | ✅ |
| 프론트엔드 상세 설계 (Section 6) | 93% | ✅ |
| 에러 처리 (Section 7) | 100% | ✅ |
| 보안 설계 (Section 8) | 78% | ⚠️ |
| 인프라 설계 (Section 9) | 100% | ✅ |
| 구현 순서 (Section 11) | 100% | ✅ |
| **전체 (Overall)** | **93%** | **✅** |

---

## Gap 목록

### 🔴 미구현 항목 (3건)

| # | 항목 | 영향도 | 설명 |
|---|------|--------|------|
| 1 | RLS 정책 | High | `ALTER TABLE users ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` 미구현. 멀티테넌시 DB 레벨 격리 누락 |
| 2 | Secure 쿠키 플래그 | Medium | 쿠키 Secure=false. 프로덕션에서 HTTPS 없이 쿠키 전송 가능 |
| 3 | SameSite=Strict | Medium | Gin의 c.SetCookie()에서 SameSite 설정 미적용. CSRF 방어 불완전 |

### 🟡 합리적 추가 항목 (4건)

| # | 항목 | 설명 |
|---|------|------|
| 1 | GetUserByEmailAnyTenant 쿼리 | 로그인 시 tenant 무관 이메일 조회 필요 |
| 2 | GET /health 엔드포인트 | 운영/모니터링 유용 |
| 3 | 자동 마이그레이션 | 서버 시작 시 migrate.Up() |
| 4 | SSR 안전성 체크 | typeof window 가드 추가 |

### 🔵 변경 항목 (6건, 모두 Low 영향도)

- JWTManager: interface → struct
- RequireRole 파라미터: model.Role → string
- context key: 커스텀 타입 → string 상수
- API Client baseURL: 환경변수 → 빈 문자열 (Next.js proxy)
- (public) layout: 심플 헤더 → 빈 레이아웃
- slug 생성: 숫자 접미사 → 타임스탬프 접미사

---

## 결론

Match Rate **93%** 로 90% 기준 통과. 미구현 Gap 3건은 모두 보안 관련 항목으로, 기능 동작에는 영향 없으나 프로덕션 배포 전 해결 권장.
