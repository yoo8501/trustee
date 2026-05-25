package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — 관리자 전용 HTTP 핸들러.
//
// 라우터에서 RequireRole(super_admin) 미들웨어로 권한을 강제하고,
// handler 는 비즈니스 로직만 처리한다.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type terminateRequest struct {
	UserID int64  `json:"userId"`
	Reason string `json:"reason,omitempty"`
}

type terminateResponse struct {
	ID           int64  `json:"id"`
	Status       string `json:"status"`
	TokenVersion int32  `json:"tokenVersion"`
}

// ---------- Terminate ----------

// Terminate — POST /api/users/terminate. super_admin only (라우터 미들웨어 강제).
//
// 실패 분기:
//   - 본인 terminate → 400 + CANNOT_TERMINATE_SELF.
//   - userId 누락 / 0 이하 → 400 + VALIDATION_FAILED.
//   - JSON 형식 오류 → 400 + INVALID_REQUEST.
//   - target 미존재 → 404 + NOT_FOUND.
func (h *Handler) Terminate(c *gin.Context) {
	var req terminateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"요청 형식이 잘못되었습니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidRequest},
		))
		return
	}
	if req.UserID <= 0 {
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"입력값을 확인해 주세요.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.ValidationFailed,
				Fields:    []apiresult.FieldError{{Field: "userId", Reason: "required"}},
			},
		))
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.Terminate(c.Request.Context(), TerminateInput{
		ActorID:  actorID,
		TargetID: req.UserID,
		TenantID: tenantID,
		Reason:   req.Reason,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrCannotTerminateSelf):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"본인 계정은 퇴사 처리할 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.CannotTerminateSelf},
			))
			return
		case errors.Is(err, ErrNotFound):
			c.JSON(http.StatusNotFound, apiresult.Failure(
				"사용자를 찾을 수 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
			))
			return
		}
		c.JSON(http.StatusInternalServerError, apiresult.Failure(
			"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
		))
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(terminateResponse{
		ID:           res.ID,
		Status:       string(res.Status),
		TokenVersion: res.TokenVersion,
	}))
}
