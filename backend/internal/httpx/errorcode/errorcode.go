// Package errorcode — 표준 ErrorCode enum.
//
// 모든 ApiResult 실패 응답의 `details.errorCode` 는 본 패키지의 상수 중 하나여야 한다.
// 신규 코드 추가 시 context/error.md §1 표와 frontend 매핑을 함께 갱신한다.
package errorcode

const (
	// InternalError — 서버 내부 오류 (500). 사용자에게 일반화된 메시지 노출.
	InternalError = "INTERNAL_ERROR"
	// ValidationFailed — 입력 검증 실패 (400). `fields[]` 동봉.
	ValidationFailed = "VALIDATION_FAILED"
	// InvalidRequest — 요청 형식/파싱 오류 (400). 예: JSON 형식 오류.
	InvalidRequest = "INVALID_REQUEST"
	// Unauthenticated — 인증 누락/만료 (401).
	Unauthenticated = "UNAUTHENTICATED"
	// Forbidden — 인증은 되었으나 권한 없음 (403).
	Forbidden = "FORBIDDEN"
	// NotFound — 리소스 없음 (404).
	NotFound = "NOT_FOUND"
	// Conflict — 충돌 (409). 중복, 동시성 충돌 등.
	Conflict = "CONFLICT"
	// RateLimited — rate limit 초과 (429).
	RateLimited = "RATE_LIMITED"
	// ExternalServiceErr — 외부 시스템 오류 (502).
	ExternalServiceErr = "EXTERNAL_SERVICE_ERROR"
)
