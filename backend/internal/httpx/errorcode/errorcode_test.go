package errorcode_test

import (
	"testing"

	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// TestEnumValues: context/error.md §1 표준 enum 값 stringify 검증.
func TestEnumValues(t *testing.T) {
	cases := map[string]string{
		"InternalError":      "INTERNAL_ERROR",
		"ValidationFailed":   "VALIDATION_FAILED",
		"InvalidRequest":     "INVALID_REQUEST",
		"Unauthenticated":    "UNAUTHENTICATED",
		"Forbidden":          "FORBIDDEN",
		"NotFound":           "NOT_FOUND",
		"Conflict":           "CONFLICT",
		"RateLimited":        "RATE_LIMITED",
		"ExternalServiceErr": "EXTERNAL_SERVICE_ERROR",
		"TokenExpired":       "TOKEN_EXPIRED",
		"CannotDemoteSelf":   "CANNOT_DEMOTE_SELF",
		"UserTerminated":     "USER_TERMINATED",
		"EmailDuplicate":     "EMAIL_DUPLICATE",
		"InvalidCredentials": "INVALID_CREDENTIALS",
	}

	got := map[string]string{
		"InternalError":      errorcode.InternalError,
		"ValidationFailed":   errorcode.ValidationFailed,
		"InvalidRequest":     errorcode.InvalidRequest,
		"Unauthenticated":    errorcode.Unauthenticated,
		"Forbidden":          errorcode.Forbidden,
		"NotFound":           errorcode.NotFound,
		"Conflict":           errorcode.Conflict,
		"RateLimited":        errorcode.RateLimited,
		"ExternalServiceErr": errorcode.ExternalServiceErr,
		"TokenExpired":       errorcode.TokenExpired,
		"CannotDemoteSelf":   errorcode.CannotDemoteSelf,
		"UserTerminated":     errorcode.UserTerminated,
		"EmailDuplicate":     errorcode.EmailDuplicate,
		"InvalidCredentials": errorcode.InvalidCredentials,
	}

	for name, want := range cases {
		if got[name] != want {
			t.Fatalf("errorcode.%s = %q, want %q", name, got[name], want)
		}
	}
}
