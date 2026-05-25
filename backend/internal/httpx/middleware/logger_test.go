package middleware_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
)

// TestLogger_EmitsStructuredLogWithRequestID: 응답 후 method/path/status/latency_ms/request_id 포함된 JSON 로그.
func TestLogger_EmitsStructuredLogWithRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	r := gin.New()
	r.Use(middleware.RequestID(), middleware.Logger(logger))
	r.GET("/ping", func(c *gin.Context) {
		// 핸들러는 응답에 status 200 작성.
		c.String(http.StatusOK, "pong")
		// context에 request_id 가 있는지도 함께 검증.
		if middleware.RequestIDFrom(c.Request.Context()) == "" {
			t.Fatalf("request_id missing in handler context")
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	req = req.WithContext(context.Background())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if !strings.Contains(buf.String(), "\"request_id\"") {
		t.Fatalf("log missing request_id field: %s", buf.String())
	}

	var entry map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &entry); err != nil {
		t.Fatalf("log not valid json: %v body=%s", err, buf.String())
	}
	for _, k := range []string{"method", "path", "status", "latency_ms", "request_id"} {
		if _, ok := entry[k]; !ok {
			t.Fatalf("log missing key %q in %s", k, buf.String())
		}
	}
	if entry["method"] != "GET" || entry["path"] != "/ping" {
		t.Fatalf("log method/path wrong: %+v", entry)
	}
	if entry["status"].(float64) != 200 {
		t.Fatalf("log status wrong: %+v", entry["status"])
	}
}
