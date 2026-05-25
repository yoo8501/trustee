package holiday

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — /api/hr/holidays.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type holidayResponse struct {
	ID          int64  `json:"id"`
	Date        string `json:"date"` // YYYY-MM-DD
	Name        string `json:"name"`
	IsRecurring bool   `json:"isRecurring"`
	CountryCode string `json:"countryCode"`
}

func toResponse(v View) holidayResponse {
	return holidayResponse{
		ID:          v.ID,
		Date:        v.Date.Format("2006-01-02"),
		Name:        v.Name,
		IsRecurring: v.IsRecurring,
		CountryCode: v.CountryCode,
	}
}

// ---------- List ----------

type listRequest struct {
	From string `json:"from,omitempty"` // YYYY-MM-DD
	To   string `json:"to,omitempty"`
}

// List — POST /api/hr/holidays/list (인증된 모든 사용자).
func (h *Handler) List(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)

	in := ListInput{}
	if req.From != "" && req.To != "" {
		from, err1 := time.Parse("2006-01-02", req.From)
		to, err2 := time.Parse("2006-01-02", req.To)
		if err1 != nil || err2 != nil {
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).",
				&apiresult.ErrorDetails{
					ErrorCode: errorcode.ValidationFailed,
					Fields: []apiresult.FieldError{
						{Field: "from/to", Reason: "format"},
					},
				},
			))
			return
		}
		in.From = &from
		in.To = &to
	}

	tenantID, _ := auth.TenantIDFrom(c)
	rows, err := h.svc.List(c.Request.Context(), tenantID, in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apiresult.Failure(
			"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
		))
		return
	}
	items := make([]holidayResponse, 0, len(rows))
	for _, v := range rows {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, int64(len(items))))
}
