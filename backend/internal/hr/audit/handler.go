package audit

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — HR / super_admin 의 감사 로그 조회 HTTP 핸들러.
//
// 라우터에서 RequireRole(hr_manager, super_admin) 미들웨어로 권한을 강제하므로
// handler 는 인가된 요청만 받는다고 가정한다.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type attendanceListRequest struct {
	UserID   *int64  `json:"userId,omitempty"`
	From     *string `json:"from,omitempty"`     // YYYY-MM-DD
	To       *string `json:"to,omitempty"`       // YYYY-MM-DD
	Source   *string `json:"source,omitempty"`   // 'button' | 'manual_correction'
	ClientIP *string `json:"clientIp,omitempty"` // 정확 일치
	Page     int32   `json:"page,omitempty"`
	Size     int32   `json:"size,omitempty"`
}

type attendanceListItem struct {
	ID                int64   `json:"id"`
	UserID            int64   `json:"userId"`
	WorkDate          string  `json:"workDate"`
	CheckInAt         *string `json:"checkInAt,omitempty"`
	CheckOutAt        *string `json:"checkOutAt,omitempty"`
	LunchBreakMinutes int32   `json:"lunchBreakMinutes"`
	Source            string  `json:"source"`
	ClientIP          string  `json:"clientIp,omitempty"`
	UserAgent         string  `json:"userAgent,omitempty"`
	Status            string  `json:"status"`
	CreatedAt         string  `json:"createdAt,omitempty"`
}

func toItem(v AttendanceAuditView) attendanceListItem {
	out := attendanceListItem{
		ID:                v.ID,
		UserID:            v.UserID,
		WorkDate:          v.WorkDate.Format("2006-01-02"),
		LunchBreakMinutes: v.LunchBreakMinutes,
		Source:            v.Source,
		ClientIP:          v.ClientIP,
		UserAgent:         v.UserAgent,
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
	if !v.CreatedAt.IsZero() {
		out.CreatedAt = v.CreatedAt.Format(time.RFC3339)
	}
	return out
}

// ---------- AttendanceList ----------

// AttendanceList — POST /api/hr/audit/attendance/list.
//
// 필터 (모두 optional): userId, from(YYYY-MM-DD), to(YYYY-MM-DD), source, clientIp.
// Pagination: page (1-based, default 1), size (default 20, max 100).
//
// 빈 body / 잘못된 JSON 도 허용 (모두 기본값 적용) — 감사 페이지 첫 진입 시 무필터 호출.
// 명시적으로 파싱 실패해도 ValidationFailed 가 아닌 default 적용 (필터는 모두 optional).
func (h *Handler) AttendanceList(c *gin.Context) {
	var req attendanceListRequest
	_ = c.ShouldBindJSON(&req)

	var (
		from *time.Time
		to   *time.Time
	)
	if req.From != nil && *req.From != "" {
		t, err := time.Parse("2006-01-02", *req.From)
		if err != nil {
			writeValidationFailed(c, "from", "format")
			return
		}
		from = &t
	}
	if req.To != nil && *req.To != "" {
		t, err := time.Parse("2006-01-02", *req.To)
		if err != nil {
			writeValidationFailed(c, "to", "format")
			return
		}
		to = &t
	}

	tenantID, _ := auth.TenantIDFrom(c)
	res, err := h.svc.Search(c.Request.Context(), SearchInput{
		TenantID: tenantID,
		UserID:   req.UserID,
		From:     from,
		To:       to,
		Source:   req.Source,
		ClientIP: req.ClientIP,
		Page:     req.Page,
		Size:     req.Size,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apiresult.Failure(
			"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
		))
		return
	}

	items := make([]attendanceListItem, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toItem(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- helpers ----------

func writeValidationFailed(c *gin.Context, field, reason string) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"입력값을 확인해 주세요.",
		&apiresult.ErrorDetails{
			ErrorCode: errorcode.ValidationFailed,
			Fields:    []apiresult.FieldError{{Field: field, Reason: reason}},
		},
	))
}
