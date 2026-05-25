// Package server — Gin 엔진 부트스트랩.
//
// HTTP 핸들러 등록, 미들웨어 체인 구성, /health 및 /debug/error 라우트 등록을 한다.
// 도메인 핸들러는 Sprint 2 이후 본 패키지를 통해 라우터에 부착된다.
package server

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
)

// Config — 서버 부트스트랩 설정. 의존성은 향후 DB/Cron 등 확장 예정.
type Config struct {
	// TenantID 는 단일 조직 운영 단계에서 사용할 기본 tenant id. 보통 1.
	TenantID int64
	// Logger 가 nil 이면 slog.Default() 를 사용한다.
	Logger *slog.Logger
}

// NewEngine 은 미들웨어와 기본 라우트가 부착된 Gin 엔진을 만든다.
//
// 미들웨어 순서:
//  1. RequestID — 모든 후속 미들웨어/핸들러가 request_id 를 사용 가능
//  2. Logger    — 요청/응답 구조화 로그
//  3. Recover   — panic 캡처
//  4. Tenant    — context 에 tenant id 주입
func NewEngine(cfg Config) (*gin.Engine, error) {
	if cfg.TenantID == 0 {
		cfg.TenantID = 1
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	eng := gin.New()
	eng.Use(
		middleware.RequestID(),
		middleware.Logger(logger),
		middleware.Recover(),
		middleware.Tenant(cfg.TenantID),
	)

	// 헬스체크 - 단순 liveness probe. Sprint 1 단계에서 DB 의존 없음.
	eng.GET("/health", func(c *gin.Context) {
		type healthData struct {
			Status string `json:"status"`
		}
		c.JSON(http.StatusOK, apiresult.Success(healthData{Status: "ok"}))
	})

	// 의도된 실패 라우트 - ApiResult 실패 envelope shape 와 INTERNAL_ERROR 매핑 검증용.
	// 운영 환경에서는 본 라우트를 제거하거나 dev 전용 그룹으로 격리할 예정.
	eng.GET("/debug/error", func(c *gin.Context) {
		reqID := middleware.RequestIDFrom(c.Request.Context())
		c.JSON(http.StatusInternalServerError, apiresult.Failure(
			"의도된 디버그 에러입니다.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.InternalError,
				TraceID:   reqID,
			},
		))
	})

	return eng, nil
}
