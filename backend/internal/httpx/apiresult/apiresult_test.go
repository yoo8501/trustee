package apiresult_test

import (
	"encoding/json"
	"testing"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

type sampleData struct {
	Status string `json:"status"`
}

// TestSuccess: Success 헬퍼는 success=true, data 비어있지 않음, details/total nil.
func TestSuccess(t *testing.T) {
	env := apiresult.Success(sampleData{Status: "ok"})

	if !env.Success {
		t.Fatalf("Success.Success = false, want true")
	}
	if env.Data == nil {
		t.Fatalf("Success.Data is nil, want non-nil")
	}
	if env.Data.Status != "ok" {
		t.Fatalf("Success.Data.Status = %q, want \"ok\"", env.Data.Status)
	}
	if env.Message == nil || *env.Message != "ok" {
		t.Fatalf("Success.Message should default to \"ok\", got %v", env.Message)
	}
	if env.Details != nil {
		t.Fatalf("Success.Details should be nil, got %+v", env.Details)
	}
	if env.Total != nil {
		t.Fatalf("Success.Total should be nil, got %+v", env.Total)
	}
}

// TestSuccessList: SuccessList → total 필드 채워짐.
func TestSuccessList(t *testing.T) {
	items := []sampleData{{Status: "a"}, {Status: "b"}}
	env := apiresult.SuccessList(items, 42)

	if !env.Success {
		t.Fatalf("SuccessList.Success = false, want true")
	}
	if env.Data == nil || len(*env.Data) != 2 {
		t.Fatalf("SuccessList.Data length wrong, got %+v", env.Data)
	}
	if env.Total == nil || *env.Total != 42 {
		t.Fatalf("SuccessList.Total = %v, want 42", env.Total)
	}
}

// TestFailure: Failure → success=false, message non-nil, details.errorCode 매핑.
func TestFailure(t *testing.T) {
	env := apiresult.Failure("입력값을 확인해 주세요", &apiresult.ErrorDetails{
		ErrorCode: errorcode.ValidationFailed,
		Fields: []apiresult.FieldError{
			{Field: "email", Reason: "required"},
		},
	})

	if env.Success {
		t.Fatalf("Failure.Success = true, want false")
	}
	if env.Message == nil || *env.Message == "" {
		t.Fatalf("Failure.Message must be non-empty pointer, got %v", env.Message)
	}
	if env.Details == nil {
		t.Fatalf("Failure.Details is nil")
	}
	if env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("Failure.Details.ErrorCode = %q, want %q", env.Details.ErrorCode, errorcode.ValidationFailed)
	}
	if len(env.Details.Fields) != 1 || env.Details.Fields[0].Field != "email" {
		t.Fatalf("Failure.Details.Fields wrong: %+v", env.Details.Fields)
	}
	if env.Data != nil {
		t.Fatalf("Failure.Data should be nil, got %+v", env.Data)
	}
}

// TestFailure_EmptyMessagePanics: message 빈 문자열은 금지 (context/api.md §2).
func TestFailure_EmptyMessagePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("Failure(empty message) should panic, but didn't")
		}
	}()
	_ = apiresult.Failure("", &apiresult.ErrorDetails{ErrorCode: errorcode.InternalError})
}

// TestEnvelope_JSONRoundTrip: marshal → unmarshal 시 의미 보존.
func TestEnvelope_JSONRoundTrip(t *testing.T) {
	original := apiresult.Success(sampleData{Status: "ok"})

	raw, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded apiresult.Envelope[sampleData]
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if !decoded.Success {
		t.Fatalf("decoded.Success = false")
	}
	if decoded.Data == nil || decoded.Data.Status != "ok" {
		t.Fatalf("decoded.Data wrong: %+v", decoded.Data)
	}

	// success envelope이 success / data / message / details / total 필드를 항상 갖는지 확인.
	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatalf("generic unmarshal failed: %v", err)
	}
	for _, key := range []string{"success", "data", "message", "details", "total"} {
		if _, ok := generic[key]; !ok {
			t.Fatalf("envelope missing key %q in JSON output: %s", key, string(raw))
		}
	}
}

// TestFailure_JSONShape: 실패 envelope JSON 필드 확인.
func TestFailure_JSONShape(t *testing.T) {
	env := apiresult.Failure("서버 오류", &apiresult.ErrorDetails{
		ErrorCode: errorcode.InternalError,
		TraceID:   "trace-123",
	})

	raw, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if generic["success"] != false {
		t.Fatalf("success should be false, got %v", generic["success"])
	}
	if generic["data"] != nil {
		t.Fatalf("data should be nil, got %v", generic["data"])
	}
	details, ok := generic["details"].(map[string]any)
	if !ok {
		t.Fatalf("details should be object, got %v", generic["details"])
	}
	if details["errorCode"] != errorcode.InternalError {
		t.Fatalf("details.errorCode wrong: %v", details["errorCode"])
	}
	if details["traceId"] != "trace-123" {
		t.Fatalf("details.traceId wrong: %v", details["traceId"])
	}
}
