// Package apiresult — ApiResult envelope 헬퍼.
//
// 본 패키지는 모든 HTTP 응답의 단일 형식 (`ApiResult<T>`)을 강제한다.
// 자세한 contract 는 context/api.md §1, §2 참조.
//
// 절대 규칙:
//   - `gin.H{}` / `map[string]any{}` / 임의 struct 직접 반환 금지
//   - HTTP status 와 `Success` 필드 일치 (200+true / 4xx,5xx+false)
//   - `Failure` 호출 시 `message` 빈 문자열 금지
package apiresult

// Envelope is the ApiResult contract envelope. context/api.md §1.
//
// 필드는 모두 항상 직렬화된다 (omitempty 없음) — 클라이언트가 shape 를 안정적으로
// 파싱하도록 보장한다. `data`, `message`, `details`, `total` 은 포인터로 두어
// null 가능성을 명시한다.
type Envelope[T any] struct {
	Success bool          `json:"success"`
	Data    *T            `json:"data"`
	Message *string       `json:"message"`
	Details *ErrorDetails `json:"details"`
	Total   *int64        `json:"total"`
}

// ErrorDetails carries developer/operator-facing error info.
// `errorCode` 는 context/error.md §1 enum 중 하나여야 한다.
type ErrorDetails struct {
	ErrorCode string       `json:"errorCode"`
	Fields    []FieldError `json:"fields,omitempty"`
	TraceID   string       `json:"traceId,omitempty"`
}

// FieldError describes a single field-level validation error.
type FieldError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

// defaultSuccessMessage 는 별도 메시지 없이 Success 호출 시 사용되는 기본 문구.
const defaultSuccessMessage = "ok"

// Success 는 단일 응답 데이터를 감싸는 성공 envelope 을 만든다.
// `Message` 는 기본 "ok" 로 채워지고, 호출자가 별도 메시지가 필요하면
// 반환 값의 `Message` 를 직접 교체한다.
func Success[T any](data T) Envelope[T] {
	msg := defaultSuccessMessage
	return Envelope[T]{
		Success: true,
		Data:    &data,
		Message: &msg,
	}
}

// SuccessList 는 목록 응답 envelope 을 만든다. `Total` 은 전체 건수.
// items 가 nil 인 경우에도 빈 슬라이스로 정규화하여 JSON `data: []` 보장.
func SuccessList[T any](items []T, total int64) Envelope[[]T] {
	if items == nil {
		items = []T{}
	}
	msg := defaultSuccessMessage
	return Envelope[[]T]{
		Success: true,
		Data:    &items,
		Message: &msg,
		Total:   &total,
	}
}

// Failure 는 실패 envelope 을 만든다. `message` 빈 문자열은 panic — context/api.md §2 위반.
// 호출자는 사용자에게 보여줄 수 있는 메시지(한글 권장)와 ErrorDetails 를 함께 전달한다.
func Failure(message string, details *ErrorDetails) Envelope[any] {
	if message == "" {
		panic("apiresult.Failure: message must be non-empty (context/api.md §2 위반)")
	}
	return Envelope[any]{
		Success: false,
		Data:    nil,
		Message: &message,
		Details: details,
	}
}
