package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
)

// TestRecover_CapturesPanicAsApiResultFailure: panic → 500 + ApiResult 실패 envelope.
func TestRecover_CapturesPanicAsApiResultFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.Recover())
	r.GET("/boom", func(c *gin.Context) {
		panic("boom!")
	})

	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}

	var env apiresult.Envelope[any]
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal failed: %v body=%s", err, w.Body.String())
	}
	if env.Success {
		t.Fatalf("envelope.success = true, want false")
	}
	if env.Message == nil || *env.Message == "" {
		t.Fatalf("envelope.message must be non-empty")
	}
	if env.Details == nil || env.Details.ErrorCode != errorcode.InternalError {
		t.Fatalf("envelope.details.errorCode = %+v, want INTERNAL_ERROR", env.Details)
	}
	// raw panic message must not leak.
	if env.Message != nil && *env.Message == "boom!" {
		t.Fatalf("raw panic message leaked into response: %q", *env.Message)
	}
}
