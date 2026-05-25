// Package apiresult — Sprint 1 Red 단계 stub. 구현은 Green 커밋에서 채운다.
package apiresult

// Envelope is the ApiResult contract envelope. See context/api.md §1.
type Envelope[T any] struct {
	Success bool          `json:"success"`
	Data    *T            `json:"data"`
	Message *string       `json:"message"`
	Details *ErrorDetails `json:"details"`
	Total   *int64        `json:"total"`
}

// ErrorDetails carries developer/operator-facing error info.
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

// Success — Red stub.
func Success[T any](_ T) Envelope[T] {
	return Envelope[T]{}
}

// SuccessList — Red stub.
func SuccessList[T any](_ []T, _ int64) Envelope[[]T] {
	return Envelope[[]T]{}
}

// Failure — Red stub.
func Failure(_ string, _ *ErrorDetails) Envelope[any] {
	return Envelope[any]{}
}
