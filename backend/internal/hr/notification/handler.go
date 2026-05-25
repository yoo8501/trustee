package notification

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — /api/hr/notifications.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type notificationResponse struct {
	ID         int64   `json:"id"`
	Type       string  `json:"type"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	RelatedURL string  `json:"relatedUrl,omitempty"`
	ReadAt     *string `json:"readAt,omitempty"`
	CreatedAt  string  `json:"createdAt"`
}

func toResponse(v View) notificationResponse {
	out := notificationResponse{
		ID:         v.ID,
		Type:       v.Type,
		Title:      v.Title,
		Body:       v.Body,
		RelatedURL: v.RelatedURL,
		CreatedAt:  v.CreatedAt.Format(time.RFC3339),
	}
	if v.ReadAt != nil {
		s := v.ReadAt.Format(time.RFC3339)
		out.ReadAt = &s
	}
	return out
}

// ---------- List ----------

type listRequest struct {
	Page       int32 `json:"page"`
	Size       int32 `json:"size"`
	UnreadOnly bool  `json:"unreadOnly,omitempty"`
}

// List — POST /api/hr/notifications/list (인증된 본인).
func (h *Handler) List(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)

	userID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.List(c.Request.Context(), tenantID, userID, ListInput{
		Page: req.Page, Size: req.Size, UnreadOnly: req.UnreadOnly,
	})
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]notificationResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Read ----------

// Read — POST /api/hr/notifications/:id/read (본인 알림만).
func (h *Handler) Read(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"id 형식이 잘못되었습니다.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.ValidationFailed,
				Fields:    []apiresult.FieldError{{Field: "id", Reason: "format"}},
			},
		))
		return
	}

	userID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Read(c.Request.Context(), tenantID, userID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, apiresult.Failure(
				"알림을 찾을 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
			))
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- ReadAll ----------

type readAllResponse struct {
	Affected int64 `json:"affected"`
}

// ReadAll — POST /api/hr/notifications/read-all (본인 모든 알림).
func (h *Handler) ReadAll(c *gin.Context) {
	userID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	n, err := h.svc.ReadAll(c.Request.Context(), tenantID, userID)
	if err != nil {
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(readAllResponse{Affected: n}))
}

// ---------- helpers ----------

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
