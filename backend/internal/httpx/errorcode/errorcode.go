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

	// TokenExpired — JWT access/refresh 만료 (401). UNAUTHENTICATED 보다 구체적 신호로,
	// 프론트가 refresh 시도 분기 / 강제 logout 분기를 구분하는 데 사용한다.
	TokenExpired = "TOKEN_EXPIRED"
	// CannotDemoteSelf — 본인 role 강등 시도 (400). super_admin 본인이 본인 role 을 낮추려 할 때 발생.
	CannotDemoteSelf = "CANNOT_DEMOTE_SELF"
	// UserTerminated — terminated 상태 user 의 로그인 시도 (400).
	UserTerminated = "USER_TERMINATED"
	// EmailDuplicate — 회원가입 시 이미 존재하는 email (400). VALIDATION_FAILED 의 특수 케이스.
	EmailDuplicate = "EMAIL_DUPLICATE"
	// InvalidCredentials — 로그인 자격 증명 불일치 (400). UNAUTHENTICATED 와 구분 — 로그인 폼에 직접 노출 가능한 코드.
	InvalidCredentials = "INVALID_CREDENTIALS"
	// InvalidAccrualPolicy — leave_type.accrual_policy JSON 스키마 검증 실패 (400).
	// VALIDATION_FAILED 보다 구체적 — FE 가 별도 안내 문구 표시 가능.
	InvalidAccrualPolicy = "INVALID_ACCRUAL_POLICY"
	// CheckInRequired — 퇴근 (/check-out) 시도 시 같은 날 출근 record 가 없는 경우 (400).
	// Sprint 4 출퇴근 도메인. FE 는 inline 안내 ("출근 체크 먼저 해주세요").
	CheckInRequired = "CHECK_IN_REQUIRED"
	// CannotTerminateSelf — super_admin 본인이 본인 계정을 terminate 처리하려 시도 (400).
	// Sprint 9 관리자 화면 + 감사 로그 도메인. FE 는 toast / form error.
	CannotTerminateSelf = "CANNOT_TERMINATE_SELF"

	// ApprovalInvalidState — 결재 상태 전이 불가 (409).
	// 예: 이미 승인/반려된 결재를 다시 승인/반려/취소 시도.
	// Sprint 6 LeaveRequest. FE 는 mutation hook 메시지.
	ApprovalInvalidState = "APPROVAL_INVALID_STATE"
	// InsufficientLeaveBalance — 휴가 신청 시점 잔여 부족 (409).
	// details.shortfall_hours (float) 동봉.
	// Sprint 6 LeaveRequest. FE 는 form inline 사유 표시.
	InsufficientLeaveBalance = "INSUFFICIENT_LEAVE_BALANCE"
	// DuplicateLeaveDate — 같은 사용자의 pending|approved 신청과 날짜 겹침 (409).
	// Sprint 6 LeaveRequest. FE 는 form 단계 차단 + 안내.
	DuplicateLeaveDate = "DUPLICATE_LEAVE_DATE"
	// InvalidDateRange — start_at > end_at (400). VALIDATION_FAILED 보다 구체적.
	// Sprint 6 LeaveRequest. FE 는 form field error.
	InvalidDateRange = "INVALID_DATE_RANGE"

	// FileTooLarge — 첨부 파일 크기 초과 (413).
	// Sprint 7 ExpenseReport 첨부. FE 는 inline 안내 ("최대 10MB").
	FileTooLarge = "FILE_TOO_LARGE"
	// InvalidMimeType — 첨부 파일 mime type 불일치 (400).
	// Sprint 7 ExpenseReport 첨부. FE 는 inline 안내 ("이미지 또는 PDF만 가능").
	InvalidMimeType = "INVALID_MIME_TYPE"

	// DateRangeTooLarge — 캘린더 / 통계 조회 시 from~to 범위가 정책 한도 (3개월) 초과 (400).
	// Sprint 8 공유 캘린더. FE 는 form field error 또는 toast 로 안내.
	DateRangeTooLarge = "DATE_RANGE_TOO_LARGE"
)
