package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
)

// TestRequestID_GeneratedWhenMissing: 요청에 X-Request-ID 가 없으면 생성하여 응답 header 에 포함.
func TestRequestID_GeneratedWhenMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.RequestID())
	r.GET("/echo", func(c *gin.Context) {
		id := middleware.RequestIDFrom(c.Request.Context())
		if id == "" {
			t.Fatalf("RequestIDFrom returned empty string")
		}
		c.String(http.StatusOK, id)
	})

	req := httptest.NewRequest(http.MethodGet, "/echo", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	got := w.Header().Get("X-Request-ID")
	if got == "" {
		t.Fatalf("X-Request-ID header missing in response")
	}
	if body := w.Body.String(); body != got {
		t.Fatalf("response body request id %q != header %q", body, got)
	}
}

// TestRequestID_UsesIncomingHeader: 요청 헤더에 값이 있으면 그대로 사용.
func TestRequestID_UsesIncomingHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.RequestID())
	r.GET("/echo", func(c *gin.Context) {
		c.String(http.StatusOK, middleware.RequestIDFrom(c.Request.Context()))
	})

	req := httptest.NewRequest(http.MethodGet, "/echo", nil)
	req.Header.Set("X-Request-ID", "fixed-id-123")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get("X-Request-ID"); got != "fixed-id-123" {
		t.Fatalf("X-Request-ID = %q, want fixed-id-123", got)
	}
	if body := w.Body.String(); body != "fixed-id-123" {
		t.Fatalf("body = %q, want fixed-id-123", body)
	}
}
