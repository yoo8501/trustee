package leaverequest

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Handler — /api/hr/leave-requests.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type leaveRequestResponse struct {
	ID              int64   `json:"id"`
	RequesterID     int64   `json:"requesterId"`
	LeaveTypeID     int64   `json:"leaveTypeId"`
	StartAt         string  `json:"startAt"`
	EndAt           string  `json:"endAt"`
	Hours           float64 `json:"hours"`
	Reason          string  `json:"reason,omitempty"`
	Status          string  `json:"status"`
	ApproverID      int64   `json:"approverId,omitempty"`
	DecidedAt       *string `json:"decidedAt,omitempty"`
	DecisionComment string  `json:"decisionComment,omitempty"`
	CreatedAt       string  `json:"createdAt,omitempty"`
}

func toResponse(v View) leaveRequestResponse {
	out := leaveRequestResponse{
		ID:              v.ID,
		RequesterID:     v.RequesterID,
		LeaveTypeID:     v.LeaveTypeID,
		StartAt:         v.StartAt.Format(time.RFC3339),
		EndAt:           v.EndAt.Format(time.RFC3339),
		Hours:           v.Hours,
		Reason:          v.Reason,
		Status:          v.Status,
		ApproverID:      v.ApproverID,
		DecisionComment: v.DecisionComment,
	}
	if v.DecidedAt != nil {
		s := v.DecidedAt.Format(time.RFC3339)
		out.DecidedAt = &s
	}
	if !v.CreatedAt.IsZero() {
		out.CreatedAt = v.CreatedAt.Format(time.RFC3339)
	}
	return out
}

// ---------- Create ----------

type createLeaveRequestRequest struct {
	LeaveTypeID int64   `json:"leaveTypeId"`
	StartAt     string  `json:"startAt"`
	EndAt       string  `json:"endAt"`
	Hours       float64 `json:"hours"`
	Reason      string  `json:"reason,omitempty"`
}

// Create — POST /api/hr/leave-requests.
func (h *Handler) Create(c *gin.Context) {
	var req createLeaveRequestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	var fields []apiresult.FieldError
	if req.LeaveTypeID <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "leaveTypeId", Reason: "required"})
	}
	startAt, err1 := time.Parse(time.RFC3339, req.StartAt)
	if req.StartAt == "" || err1 != nil {
		fields = append(fields, apiresult.FieldError{Field: "startAt", Reason: "rfc3339"})
	}
	endAt, err2 := time.Parse(time.RFC3339, req.EndAt)
	if req.EndAt == "" || err2 != nil {
		fields = append(fields, apiresult.FieldError{Field: "endAt", Reason: "rfc3339"})
	}
	if req.Hours <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "hours", Reason: "positive"})
	}
	if len(fields) > 0 {
		writeValidationFailed(c, fields)
		return
	}

	requesterID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Create(c.Request.Context(), CreateInput{
		TenantID:    tenantID,
		RequesterID: requesterID,
		LeaveTypeID: req.LeaveTypeID,
		StartAt:     startAt,
		EndAt:       endAt,
		Hours:       req.Hours,
		Reason:      req.Reason,
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, apiresult.Success(toResponse(v)))
}

// ---------- Get ----------

// Get — GET /api/hr/leave-requests/:id.
func (h *Handler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)
	role, _ := auth.RoleFrom(c)
	hrOrAbove := permission.IsHRManagerOrAbove(role)

	v, err := h.svc.Get(c.Request.Context(), id, actorID, tenantID, hrOrAbove)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- MyList ----------

type listRequest struct {
	Page int32 `json:"page"`
	Size int32 `json:"size"`
}

// MyList — POST /api/hr/leave-requests/me/list.
func (h *Handler) MyList(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)

	requesterID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.MyList(c.Request.Context(), requesterID, tenantID, ListInput{
		Page: req.Page, Size: req.Size,
	})
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]leaveRequestResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- PendingList ----------

// PendingList — POST /api/hr/leave-requests/pending/list (team_lead+).
//
// approver_id 가 actor 인 + status='pending' 결재 대기함.
// 위임받은 신청은 (approver_id 가 위임자 = actor 본인) 자동 노출.
func (h *Handler) PendingList(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.PendingList(c.Request.Context(), actorID, tenantID, ListInput{
		Page: req.Page, Size: req.Size,
	})
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]leaveRequestResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Approve ----------

type approveRequest struct {
	Comment string `json:"comment,omitempty"`
}

// Approve — POST /api/hr/leave-requests/:id/approve (team_lead+).
func (h *Handler) Approve(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}
	var req approveRequest
	_ = c.ShouldBindJSON(&req)

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Approve(c.Request.Context(), id, actorID, tenantID, req.Comment)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- Reject ----------

type rejectRequest struct {
	Comment string `json:"comment"`
}

// Reject — POST /api/hr/leave-requests/:id/reject (team_lead+). comment 필수.
func (h *Handler) Reject(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}
	var req rejectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.Comment == "" {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "comment", Reason: "required"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Reject(c.Request.Context(), id, actorID, tenantID, req.Comment)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- Cancel ----------

// Cancel — POST /api/hr/leave-requests/:id/cancel (본인만, pending only).
func (h *Handler) Cancel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	v, err := h.svc.Cancel(c.Request.Context(), id, actorID, tenantID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// ---------- Error mapping ----------

func writeServiceError(c *gin.Context, err error) {
	// 잔여 부족 → 409 + shortfall_hours.
	if ibe, ok := IsInsufficientBalance(err); ok {
		c.JSON(http.StatusConflict, apiresult.Failure(
			"휴가 잔여가 부족합니다.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.InsufficientLeaveBalance,
				Fields: []apiresult.FieldError{
					{Field: "shortfall_hours", Reason: formatHours(ibe.ShortfallHours)},
				},
			},
		))
		return
	}
	switch {
	case errors.Is(err, ErrInvalidDateRange):
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"휴가 기간이 올바르지 않습니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidDateRange},
		))
	case errors.Is(err, ErrDuplicateLeaveDate):
		c.JSON(http.StatusConflict, apiresult.Failure(
			"같은 날짜에 이미 신청한 휴가가 있습니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.DuplicateLeaveDate},
		))
	case errors.Is(err, ErrApprovalInvalidState):
		c.JSON(http.StatusConflict, apiresult.Failure(
			"이미 결재가 완료된 신청입니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.ApprovalInvalidState},
		))
	case errors.Is(err, ErrLeaveTypeNotFound):
		writeNotFound(c, "휴가 종류를 찾을 수 없습니다.")
	case errors.Is(err, ErrLeaveRequestNotFound):
		writeNotFound(c, "휴가 신청을 찾을 수 없습니다.")
	case errors.Is(err, ErrRequesterNotFound):
		writeNotFound(c, "신청자를 찾을 수 없습니다.")
	case errors.Is(err, ErrApproverUnassigned):
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"결재자가 지정되지 않았습니다. 관리자에게 문의해 주세요.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.ValidationFailed},
		))
	case errors.Is(err, ErrForbidden):
		writeForbidden(c)
	case errors.Is(err, ErrRejectReasonRequired):
		writeValidationFailed(c, []apiresult.FieldError{{Field: "comment", Reason: "required"}})
	default:
		writeInternal(c)
	}
}

func formatHours(h float64) string {
	return strconv.FormatFloat(h, 'f', 1, 64)
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

func writeForbidden(c *gin.Context) {
	c.JSON(http.StatusForbidden, apiresult.Failure(
		"권한이 없습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.Forbidden},
	))
}

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
