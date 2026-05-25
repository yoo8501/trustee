package delegation

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — /api/hr/delegations.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type delegationResponse struct {
	ID          int64           `json:"id"`
	DelegatorID int64           `json:"delegatorId"`
	DelegateID  int64           `json:"delegateId"`
	ValidFrom   string          `json:"validFrom"`
	ValidTo     string          `json:"validTo"`
	Scope       json.RawMessage `json:"scope"`
	CreatedAt   string          `json:"createdAt,omitempty"`
}

func toDelegationResponse(v View) delegationResponse {
	scopeJSON, _ := json.Marshal(v.Scope)
	out := delegationResponse{
		ID:          v.ID,
		DelegatorID: v.DelegatorID,
		DelegateID:  v.DelegateID,
		ValidFrom:   v.ValidFrom.Format(time.RFC3339),
		ValidTo:     v.ValidTo.Format(time.RFC3339),
		Scope:       json.RawMessage(scopeJSON),
	}
	if !v.CreatedAt.IsZero() {
		out.CreatedAt = v.CreatedAt.Format(time.RFC3339)
	}
	return out
}

// ---------- Create ----------

type createDelegationRequest struct {
	DelegateID int64           `json:"delegateId"`
	ValidFrom  string          `json:"validFrom"`
	ValidTo    string          `json:"validTo"`
	Scope      json.RawMessage `json:"scope,omitempty"`
}

// Create — POST /api/hr/delegations.
//
// 본인이 자기 위임을 등록. actor != delegator 인 경우는 P1 미지원.
func (h *Handler) Create(c *gin.Context) {
	var req createDelegationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	var fields []apiresult.FieldError
	if req.DelegateID <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "delegateId", Reason: "required"})
	}
	validFrom, err1 := time.Parse(time.RFC3339, req.ValidFrom)
	if req.ValidFrom == "" || err1 != nil {
		fields = append(fields, apiresult.FieldError{Field: "validFrom", Reason: "rfc3339"})
	}
	validTo, err2 := time.Parse(time.RFC3339, req.ValidTo)
	if req.ValidTo == "" || err2 != nil {
		fields = append(fields, apiresult.FieldError{Field: "validTo", Reason: "rfc3339"})
	}
	if len(fields) > 0 {
		writeValidationFailed(c, fields)
		return
	}

	scope := map[string]any{}
	if len(req.Scope) > 0 && string(req.Scope) != "null" {
		if err := json.Unmarshal(req.Scope, &scope); err != nil {
			writeValidationFailed(c, []apiresult.FieldError{{Field: "scope", Reason: "json"}})
			return
		}
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Create(c.Request.Context(), CreateInput{
		TenantID:   tenantID,
		ActorID:    actorID,
		DelegateID: req.DelegateID,
		ValidFrom:  validFrom,
		ValidTo:    validTo,
		Scope:      scope,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrDelegationInvalidInput):
			writeValidationFailed(c, []apiresult.FieldError{{Field: "input", Reason: "invalid"}})
			return
		case errors.Is(err, ErrDelegateUserNotFound):
			writeNotFound(c, "위임받을 사용자를 찾을 수 없습니다.")
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusCreated, apiresult.Success(toDelegationResponse(v)))
}

// ---------- MyList ----------

// MyList — POST /api/hr/delegations/me/list.
//
// 본인이 등록한 모든 위임 (활성 + 미래 + 만료).
func (h *Handler) MyList(c *gin.Context) {
	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	rows, err := h.svc.ListMy(c.Request.Context(), actorID, tenantID)
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]delegationResponse, 0, len(rows))
	for _, v := range rows {
		items = append(items, toDelegationResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, int64(len(items))))
}

// ---------- Delete ----------

type deleteDelegationRequest struct {
	ID int64 `json:"id"`
}

// Delete — POST /api/hr/delegations/delete.
//
// 본인의 위임만 삭제. 다른 사람 위임은 NotFound 처리.
func (h *Handler) Delete(c *gin.Context) {
	var req deleteDelegationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "required"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	if err := h.svc.Delete(c.Request.Context(), req.ID, actorID, tenantID); err != nil {
		if errors.Is(err, ErrDelegationNotFound) {
			writeNotFound(c, "위임을 찾을 수 없습니다.")
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(struct {
		Status string `json:"status"`
	}{Status: "ok"}))
}

// ---------- helpers ----------

func writeInvalidRequest(c *gin.Context) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"요청 형식이 잘못되었습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidRequest},
	))
}

func writeValidationFailed(c *gin.Context, fields []apiresult.FieldError) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"입력값을 확인해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.ValidationFailed, Fields: fields},
	))
}

func writeNotFound(c *gin.Context, msg string) {
	c.JSON(http.StatusNotFound, apiresult.Failure(
		msg,
		&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
	))
}

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
