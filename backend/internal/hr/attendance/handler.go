package attendance

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — /api/hr/attendance.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type attendanceResponse struct {
	ID                int64   `json:"id"`
	UserID            int64   `json:"userId"`
	WorkDate          string  `json:"workDate"`             // YYYY-MM-DD (KST)
	CheckInAt         *string `json:"checkInAt,omitempty"`  // RFC3339
	CheckOutAt        *string `json:"checkOutAt,omitempty"` // RFC3339
	LunchBreakMinutes int32   `json:"lunchBreakMinutes"`
	Source            string  `json:"source"`
	Status            string  `json:"status"`
}

func toResponse(v View) attendanceResponse {
	out := attendanceResponse{
		ID:                v.ID,
		UserID:            v.UserID,
		WorkDate:          v.WorkDate.Format("2006-01-02"),
		LunchBreakMinutes: v.LunchBreakMinutes,
		Source:            v.Source,
		Status:            v.Status,
	}
	if v.CheckInAt != nil {
		s := v.CheckInAt.Format(time.RFC3339)
		out.CheckInAt = &s
	}
	if v.CheckOutAt != nil {
		s := v.CheckOutAt.Format(time.RFC3339)
		out.CheckOutAt = &s
	}
	return out
}

// ---------- CheckIn ----------

// CheckIn — POST /api/hr/attendance/check-in.
//
// 본인 (JWT user) 의 출근 기록 생성. 같은 날 두 번째 호출은 첫 record 보존 + 200.
// IP/UA 는 gin.Context 에서 자동 추출 (handler 책임).
func (h *Handler) CheckIn(c *gin.Context) {
	userID, ok := auth.UserIDFrom(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.CheckIn(c.Request.Context(), CheckInInput{
		UserID:    userID,
		TenantID:  tenantID,
		ClientIP:  c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	})
	if err != nil {
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- CheckOut ----------

// CheckOut — POST /api/hr/attendance/check-out.
//
// 본인의 퇴근 기록 갱신. 출근 record 없으면 400 + CHECK_IN_REQUIRED.
// 두 번째 클릭이면 마지막 시각으로 덮어쓴다 (요구 명세 §클럭인/아웃 엣지 케이스).
func (h *Handler) CheckOut(c *gin.Context) {
	userID, ok := auth.UserIDFrom(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.CheckOut(c.Request.Context(), CheckOutInput{
		UserID:   userID,
		TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, ErrCheckInRequired) {
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"출근 체크 먼저 해주세요.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.CheckInRequired},
			))
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- error response helpers ----------

func writeUnauthenticated(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, apiresult.Failure(
		"인증이 필요합니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
	))
}

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
