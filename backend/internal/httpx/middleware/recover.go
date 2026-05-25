package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Recover 미들웨어는 panic 을 캡처하여 500 + ApiResult 실패 envelope 로 변환한다.
//
//   - 사용자에게는 일반화된 메시지만 노출 ("서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
//   - panic value, stack trace 는 slog 로만 기록 (응답에 노출 금지 — context/error.md §3)
//   - response details.traceId 에 request_id 를 동봉하여 운영자가 로그를 찾도록 보조
func Recover() gin.HandlerFunc {
	logger := slog.Default()
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				reqID := RequestIDFrom(c.Request.Context())
				logger.LogAttrs(c.Request.Context(), slog.LevelError, "panic_recovered",
					slog.Any("panic", rec),
					slog.String("request_id", reqID),
					slog.String("stack", string(debug.Stack())),
				)

				c.AbortWithStatusJSON(http.StatusInternalServerError, apiresult.Failure(
					"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
					&apiresult.ErrorDetails{
						ErrorCode: errorcode.InternalError,
						TraceID:   reqID,
					},
				))
			}
		}()
		c.Next()
	}
}
