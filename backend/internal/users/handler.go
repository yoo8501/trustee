package users

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Handler — 사용자 관련 HTTP 핸들러.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

// userResponse — API 응답용 사용자 표현. password_hash 등 민감 정보 제외.
type userResponse struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Role      string `json:"role"`
	TeamID    *int64 `json:"teamId"`
	ManagerID *int64 `json:"managerId"`
	HireDate  string `json:"hireDate"`
}

func toUserResponse(u dbq.User) userResponse {
	out := userResponse{
		ID:     u.ID,
		Email:  u.Email,
		Name:   u.Name,
		Status: string(u.Status),
		Role:   string(u.Role),
	}
	if u.TeamID.Valid {
		v := u.TeamID.Int64
		out.TeamID = &v
	}
	if u.ManagerID.Valid {
		v := u.ManagerID.Int64
		out.ManagerID = &v
	}
	if u.HireDate.Valid {
		out.HireDate = u.HireDate.Time.Format("2006-01-02")
	}
	return out
}

// ---------- Me ----------

// Me — GET /api/users/me. 인증 필수.
func (h *Handler) Me(c *gin.Context) {
	userID, ok := auth.UserIDFrom(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, apiresult.Failure(
			"인증이 필요합니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
		))
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)

	u, err := h.svc.Me(c.Request.Context(), userID, tenantID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, apiresult.Failure(
				"사용자를 찾을 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
			))
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toUserResponse(u)))
}

// ---------- List ----------

type listRequest struct {
	Page int32 `json:"page"`
	Size int32 `json:"size"`
}

// List — POST /api/users/list. HR/super_admin only (라우터 미들웨어에서 강제).
func (h *Handler) List(c *gin.Context) {
	var req listRequest
	// 빈 body 허용 — 모두 기본값.
	_ = c.ShouldBindJSON(&req)

	tenantID, _ := auth.TenantIDFrom(c)
	res, err := h.svc.List(c.Request.Context(), tenantID, ListInput{Page: req.Page, Size: req.Size})
	if err != nil {
		writeInternal(c)
		return
	}

	items := make([]userResponse, 0, len(res.Items))
	for _, u := range res.Items {
		items = append(items, toUserResponse(u))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Update ----------

type updateRequest struct {
	ID           int64   `json:"id"`
	Name         *string `json:"name,omitempty"`
	Role         *string `json:"role,omitempty"`
	Status       *string `json:"status,omitempty"`
	TeamIDSet    bool    `json:"teamIdSet,omitempty"`
	TeamID       *int64  `json:"teamId,omitempty"`
	ManagerIDSet bool    `json:"managerIdSet,omitempty"`
	ManagerID    *int64  `json:"managerId,omitempty"`
}

// Update — POST /api/users/update. super_admin only.
func (h *Handler) Update(c *gin.Context) {
	var req updateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"입력값을 확인해 주세요.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.ValidationFailed,
				Fields:    []apiresult.FieldError{{Field: "id", Reason: "required"}},
			},
		))
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	in := UpdateInput{
		TargetID:     req.ID,
		ActorID:      actorID,
		TenantID:     tenantID,
		Name:         req.Name,
		TeamIDSet:    req.TeamIDSet,
		TeamID:       req.TeamID,
		ManagerIDSet: req.ManagerIDSet,
		ManagerID:    req.ManagerID,
	}
	if req.Role != nil {
		r := permission.Role(strings.TrimSpace(*req.Role))
		in.Role = &r
	}
	if req.Status != nil {
		st := dbq.UserStatus(strings.TrimSpace(*req.Status))
		in.Status = &st
	}

	updated, err := h.svc.Update(c.Request.Context(), in)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			c.JSON(http.StatusNotFound, apiresult.Failure(
				"사용자를 찾을 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
			))
			return
		case errors.Is(err, ErrCannotDemoteSelf):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"본인의 권한을 강등할 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.CannotDemoteSelf},
			))
			return
		case errors.Is(err, ErrInvalidRole):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"role 값이 올바르지 않습니다.",
				&apiresult.ErrorDetails{
					ErrorCode: errorcode.ValidationFailed,
					Fields:    []apiresult.FieldError{{Field: "role", Reason: "enum"}},
				},
			))
			return
		default:
			writeInternal(c)
			return
		}
	}

	c.JSON(http.StatusOK, apiresult.Success(toUserResponse(updated)))
}

// ---------- helpers ----------

func writeInvalidRequest(c *gin.Context) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"요청 형식이 잘못되었습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidRequest},
	))
}

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
