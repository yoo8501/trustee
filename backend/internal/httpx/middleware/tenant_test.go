package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
)

// TestTenant_DefaultsTo1: 단일 조직 운영 단계에서 tenant_id=1 컨텍스트에 주입.
func TestTenant_DefaultsTo1(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.Tenant(1))
	r.GET("/t", func(c *gin.Context) {
		id := middleware.TenantIDFrom(c.Request.Context())
		c.String(http.StatusOK, strconv.FormatInt(id, 10))
	})

	req := httptest.NewRequest(http.MethodGet, "/t", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if body := w.Body.String(); body != "1" {
		t.Fatalf("tenant id body = %q, want \"1\"", body)
	}
}
