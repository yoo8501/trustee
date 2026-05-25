package leave

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// LeaveTypeHandler — /api/hr/leave-types.
type LeaveTypeHandler struct {
	svc *LeaveTypeService
}

// NewLeaveTypeHandler — service 주입.
func NewLeaveTypeHandler(svc *LeaveTypeService) *LeaveTypeHandler {
	return &LeaveTypeHandler{svc: svc}
}

// ---------- DTO ----------

// leaveTypeResponse — API 응답 표현 (camelCase, FE 친화).
type leaveTypeResponse struct {
	ID            int64           `json:"id"`
	Code          string          `json:"code"`
	Name          string          `json:"name"`
	DefaultHours  float64         `json:"defaultHours"`
	AccrualPolicy json.RawMessage `json:"accrualPolicy"`
	IsPaid        bool            `json:"isPaid"`
	IsActive      bool            `json:"isActive"`
}

func toLeaveTypeResponse(v LeaveTypeView) leaveTypeResponse {
	raw, _ := MarshalAccrualPolicy(v.AccrualPolicy)
	return leaveTypeResponse{
		ID:            v.ID,
		Code:          v.Code,
		Name:          v.Name,
		DefaultHours:  v.DefaultHours,
		AccrualPolicy: json.RawMessage(raw),
		IsPaid:        v.IsPaid,
		IsActive:      v.IsActive,
	}
}

// ---------- Get ----------

// Get — GET /api/hr/leave-types/:id
func (h *LeaveTypeHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	v, err := h.svc.Get(c.Request.Context(), id, tenantID)
	if err != nil {
		if errors.Is(err, ErrLeaveTypeNotFound) {
			writeNotFound(c, "휴가 종류를 찾을 수 없습니다.")
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toLeaveTypeResponse(v)))
}

// ---------- List ----------

type listLeaveTypeRequest struct {
	Page int32 `json:"page"`
	Size int32 `json:"size"`
}

// List — POST /api/hr/leave-types/list (인증된 모든 사용자).
func (h *LeaveTypeHandler) List(c *gin.Context) {
	var req listLeaveTypeRequest
	_ = c.ShouldBindJSON(&req)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.List(c.Request.Context(), tenantID, ListLeaveTypeInput{
		Page: req.Page, Size: req.Size,
	})
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]leaveTypeResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toLeaveTypeResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Create ----------

type createLeaveTypeRequest struct {
	Code          string          `json:"code"`
	Name          string          `json:"name"`
	DefaultHours  float64         `json:"defaultHours"`
	AccrualPolicy json.RawMessage `json:"accrualPolicy"`
	IsPaid        *bool           `json:"isPaid,omitempty"`
	IsActive      *bool           `json:"isActive,omitempty"`
}

// Create — POST /api/hr/leave-types (HR/super_admin only).
func (h *LeaveTypeHandler) Create(c *gin.Context) {
	var req createLeaveTypeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	var fields []apiresult.FieldError
	if req.Code == "" {
		fields = append(fields, apiresult.FieldError{Field: "code", Reason: "required"})
	}
	if req.Name == "" {
		fields = append(fields, apiresult.FieldError{Field: "name", Reason: "required"})
	}
	if req.DefaultHours <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "defaultHours", Reason: "positive"})
	}
	if len(fields) > 0 {
		writeValidationFailed(c, fields)
		return
	}

	policy, perr := ParseAccrualPolicy(req.AccrualPolicy)
	if perr != nil {
		writeInvalidAccrualPolicy(c)
		return
	}

	isPaid := true
	if req.IsPaid != nil {
		isPaid = *req.IsPaid
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tenantID, _ := auth.TenantIDFrom(c)
	v, err := h.svc.Create(c.Request.Context(), CreateLeaveTypeInput{
		TenantID:      tenantID,
		Code:          req.Code,
		Name:          req.Name,
		DefaultHours:  req.DefaultHours,
		AccrualPolicy: policy,
		IsPaid:        isPaid,
		IsActive:      isActive,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidAccrualPolicy):
			writeInvalidAccrualPolicy(c)
			return
		case errors.Is(err, ErrLeaveTypeInvalidInput):
			writeValidationFailed(c, []apiresult.FieldError{{Field: "input", Reason: "invalid"}})
			return
		case errors.Is(err, ErrLeaveTypeCodeDuplicate):
			c.JSON(http.StatusConflict, apiresult.Failure(
				"이미 사용 중인 코드입니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.Conflict},
			))
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusCreated, apiresult.Success(toLeaveTypeResponse(v)))
}

// ---------- Update ----------

type updateLeaveTypeRequest struct {
	ID            int64           `json:"id"`
	Name          *string         `json:"name,omitempty"`
	DefaultHours  *float64        `json:"defaultHours,omitempty"`
	AccrualPolicy json.RawMessage `json:"accrualPolicy,omitempty"`
	IsPaid        *bool           `json:"isPaid,omitempty"`
	IsActive      *bool           `json:"isActive,omitempty"`
}

// Update — POST /api/hr/leave-types/update (HR/super_admin only).
func (h *LeaveTypeHandler) Update(c *gin.Context) {
	var req updateLeaveTypeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "required"}})
		return
	}

	in := UpdateLeaveTypeInput{
		ID:           req.ID,
		Name:         req.Name,
		DefaultHours: req.DefaultHours,
		IsPaid:       req.IsPaid,
		IsActive:     req.IsActive,
	}
	tenantID, _ := auth.TenantIDFrom(c)
	in.TenantID = tenantID

	if len(req.AccrualPolicy) > 0 && string(req.AccrualPolicy) != "null" {
		policy, perr := ParseAccrualPolicy(req.AccrualPolicy)
		if perr != nil {
			writeInvalidAccrualPolicy(c)
			return
		}
		in.AccrualPolicy = &policy
	}

	v, err := h.svc.Update(c.Request.Context(), in)
	if err != nil {
		switch {
		case errors.Is(err, ErrLeaveTypeNotFound):
			writeNotFound(c, "휴가 종류를 찾을 수 없습니다.")
			return
		case errors.Is(err, ErrInvalidAccrualPolicy):
			writeInvalidAccrualPolicy(c)
			return
		case errors.Is(err, ErrLeaveTypeInvalidInput):
			writeValidationFailed(c, []apiresult.FieldError{{Field: "input", Reason: "invalid"}})
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toLeaveTypeResponse(v)))
}

// ---------- Delete ----------

type deleteLeaveTypeRequest struct {
	ID int64 `json:"id"`
}

// Delete — POST /api/hr/leave-types/delete (HR/super_admin only).
func (h *LeaveTypeHandler) Delete(c *gin.Context) {
	var req deleteLeaveTypeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "required"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	if err := h.svc.Delete(c.Request.Context(), req.ID, tenantID); err != nil {
		if errors.Is(err, ErrLeaveTypeNotFound) {
			writeNotFound(c, "휴가 종류를 찾을 수 없습니다.")
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

func writeInvalidAccrualPolicy(c *gin.Context) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"적립 정책(accrual_policy)이 올바르지 않습니다.",
		&apiresult.ErrorDetails{
			ErrorCode: errorcode.InvalidAccrualPolicy,
			Fields:    []apiresult.FieldError{{Field: "accrualPolicy", Reason: "invalid"}},
		},
	))
}
