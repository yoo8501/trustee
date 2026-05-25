package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/server"
)

func newEngine(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	eng, err := server.NewEngine(server.Config{TenantID: 1})
	if err != nil {
		t.Fatalf("server.NewEngine failed: %v", err)
	}
	return eng
}

// TestHealth_ReturnsApiResultSuccess: /health 는 200 + ApiResult{success:true, data:{status:"ok"}, message:"ok"}.
func TestHealth_ReturnsApiResultSuccess(t *testing.T) {
	eng := newEngine(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}

	type healthData struct {
		Status string `json:"status"`
	}
	var env apiresult.Envelope[healthData]
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal failed: %v body=%s", err, w.Body.String())
	}

	if !env.Success {
		t.Fatalf("success = false, want true")
	}
	if env.Data == nil || env.Data.Status != "ok" {
		t.Fatalf("data = %+v, want {status:ok}", env.Data)
	}
	if env.Message == nil || *env.Message != "ok" {
		t.Fatalf("message = %v, want \"ok\"", env.Message)
	}
	if env.Details != nil {
		t.Fatalf("details should be nil, got %+v", env.Details)
	}
	// X-Request-ID 응답 헤더 포함.
	if w.Header().Get("X-Request-ID") == "" {
		t.Fatalf("X-Request-ID header missing")
	}
}

// TestDebugError_ReturnsApiResultFailure: /debug/error 는 500 + INTERNAL_ERROR.
func TestDebugError_ReturnsApiResultFailure(t *testing.T) {
	eng := newEngine(t)

	req := httptest.NewRequest(http.MethodGet, "/debug/error", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500, body=%s", w.Code, w.Body.String())
	}

	var env apiresult.Envelope[any]
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal failed: %v body=%s", err, w.Body.String())
	}
	if env.Success {
		t.Fatalf("success = true, want false")
	}
	if env.Message == nil || *env.Message == "" {
		t.Fatalf("message must be non-empty")
	}
	if env.Details == nil || env.Details.ErrorCode != errorcode.InternalError {
		t.Fatalf("details = %+v, want INTERNAL_ERROR", env.Details)
	}
}

// TestRecover_AppliesToRouter: 라우터 어딘가에서 panic 발생해도 ApiResult 실패 envelope.
func TestRecover_AppliesToRouter(t *testing.T) {
	eng := newEngine(t)
	// 테스트용 panic 라우트 추가.
	eng.GET("/_test/panic", func(c *gin.Context) {
		panic("intentional")
	})

	req := httptest.NewRequest(http.MethodGet, "/_test/panic", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
	var env apiresult.Envelope[any]
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal failed: %v body=%s", err, w.Body.String())
	}
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.InternalError {
		t.Fatalf("envelope = %+v, want failure INTERNAL_ERROR", env)
	}
}
