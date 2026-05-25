package expensereport

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

// Handler — /api/hr/expense-reports.
type Handler struct {
	svc    *Service
	attach *AttachmentManager
}

// NewHandler — service 주입. attach 가 nil 이면 첨부 라우트는 동작하지 않음 (테스트에서 옵션).
func NewHandler(svc *Service, attach *AttachmentManager) *Handler {
	return &Handler{svc: svc, attach: attach}
}

// ---------- DTO ----------

type expenseReportResponse struct {
	ID              int64   `json:"id"`
	RequesterID     int64   `json:"requesterId"`
	AmountWon       int64   `json:"amountWon"`
	Vendor          string  `json:"vendor"`
	Purpose         string  `json:"purpose"`
	PaidAt          string  `json:"paidAt"`
	AttachmentURL   string  `json:"attachmentUrl,omitempty"`
	Status          string  `json:"status"`
	ApproverID      int64   `json:"approverId,omitempty"`
	DecidedAt       *string `json:"decidedAt,omitempty"`
	DecisionComment string  `json:"decisionComment,omitempty"`
	CreatedAt       string  `json:"createdAt,omitempty"`
}

func toResponse(v View) expenseReportResponse {
	out := expenseReportResponse{
		ID:              v.ID,
		RequesterID:     v.RequesterID,
		AmountWon:       v.AmountWon,
		Vendor:          v.Vendor,
		Purpose:         v.Purpose,
		PaidAt:          v.PaidAt.Format("2006-01-02"),
		AttachmentURL:   v.AttachmentURL,
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

type createExpenseReportRequest struct {
	AmountWon int64  `json:"amountWon"`
	Vendor    string `json:"vendor"`
	Purpose   string `json:"purpose"`
	PaidAt    string `json:"paidAt"` // YYYY-MM-DD
}

// Create — POST /api/hr/expense-reports.
func (h *Handler) Create(c *gin.Context) {
	var req createExpenseReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	var fields []apiresult.FieldError
	if req.AmountWon <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "amountWon", Reason: "positive"})
	}
	if req.Vendor == "" {
		fields = append(fields, apiresult.FieldError{Field: "vendor", Reason: "required"})
	}
	if req.Purpose == "" {
		fields = append(fields, apiresult.FieldError{Field: "purpose", Reason: "required"})
	}
	paidAt, dateErr := time.Parse("2006-01-02", req.PaidAt)
	if req.PaidAt == "" || dateErr != nil {
		fields = append(fields, apiresult.FieldError{Field: "paidAt", Reason: "date"})
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
		AmountWon:   req.AmountWon,
		Vendor:      req.Vendor,
		Purpose:     req.Purpose,
		PaidAt:      paidAt,
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, apiresult.Success(toResponse(v)))
}

// ---------- Get ----------

// Get — GET /api/hr/expense-reports/:id.
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

// MyList — POST /api/hr/expense-reports/me/list.
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
	items := make([]expenseReportResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- PendingList ----------

// PendingList — POST /api/hr/expense-reports/pending/list (team_lead+).
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
	items := make([]expenseReportResponse, 0, len(res.Items))
	for _, v := range res.Items {
		items = append(items, toResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Approve ----------

type approveRequest struct {
	Comment string `json:"comment,omitempty"`
}

// Approve — POST /api/hr/expense-reports/:id/approve (team_lead+).
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

// Reject — POST /api/hr/expense-reports/:id/reject (team_lead+). comment 필수.
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

// Cancel — POST /api/hr/expense-reports/:id/cancel (본인만, pending only).
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
	switch {
	case errors.Is(err, ErrInvalidAmount):
		writeValidationFailed(c, []apiresult.FieldError{{Field: "amountWon", Reason: "positive"}})
	case errors.Is(err, ErrVendorRequired):
		writeValidationFailed(c, []apiresult.FieldError{{Field: "vendor", Reason: "required"}})
	case errors.Is(err, ErrPurposeRequired):
		writeValidationFailed(c, []apiresult.FieldError{{Field: "purpose", Reason: "required"}})
	case errors.Is(err, ErrInvalidPaidAt):
		writeValidationFailed(c, []apiresult.FieldError{{Field: "paidAt", Reason: "date"}})
	case errors.Is(err, ErrApprovalInvalidState):
		c.JSON(http.StatusConflict, apiresult.Failure(
			"이미 결재가 완료된 신청입니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.ApprovalInvalidState},
		))
	case errors.Is(err, ErrExpenseReportNotFound):
		writeNotFound(c, "지출결의서를 찾을 수 없습니다.")
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
