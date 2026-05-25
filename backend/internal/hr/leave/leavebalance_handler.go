package leave

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

// LeaveBalanceHandler — /api/hr/leave-balances.
type LeaveBalanceHandler struct {
	svc *LeaveBalanceService
}

// NewLeaveBalanceHandler — service 주입.
func NewLeaveBalanceHandler(svc *LeaveBalanceService) *LeaveBalanceHandler {
	return &LeaveBalanceHandler{svc: svc}
}

// ---------- DTO ----------

type leaveBalanceResponse struct {
	ID             int64   `json:"id"`
	UserID         int64   `json:"userId"`
	LeaveTypeID    int64   `json:"leaveTypeId"`
	LeaveTypeCode  string  `json:"leaveTypeCode,omitempty"`
	LeaveTypeName  string  `json:"leaveTypeName,omitempty"`
	PeriodYear     int32   `json:"periodYear"`
	GrantedHours   float64 `json:"grantedHours"`
	UsedHours      float64 `json:"usedHours"`
	RemainingHours float64 `json:"remainingHours"`
	ExpiresAt      *string `json:"expiresAt,omitempty"`
}

func toBalanceResponse(v LeaveBalanceView) leaveBalanceResponse {
	out := leaveBalanceResponse{
		ID:             v.ID,
		UserID:         v.UserID,
		LeaveTypeID:    v.LeaveTypeID,
		LeaveTypeCode:  v.LeaveTypeCode,
		LeaveTypeName:  v.LeaveTypeName,
		PeriodYear:     v.PeriodYear,
		GrantedHours:   v.GrantedHours,
		UsedHours:      v.UsedHours,
		RemainingHours: v.RemainingHours,
	}
	if v.ExpiresAt != nil {
		s := v.ExpiresAt.Format(time.RFC3339)
		out.ExpiresAt = &s
	}
	return out
}

// ---------- Me ----------

// Me — GET /api/hr/leave-balances/me (본인 잔여).
func (h *LeaveBalanceHandler) Me(c *gin.Context) {
	userID, ok := auth.UserIDFrom(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, apiresult.Failure(
			"인증이 필요합니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
		))
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)

	rows, err := h.svc.ListMyBalances(c.Request.Context(), userID, tenantID)
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]leaveBalanceResponse, 0, len(rows))
	for _, v := range rows {
		items = append(items, toBalanceResponse(v))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, int64(len(items))))
}

// ---------- Adjust ----------

type adjustRequest struct {
	LeaveTypeID int64   `json:"leaveTypeId"`
	PeriodYear  int32   `json:"periodYear,omitempty"`
	DeltaHours  float64 `json:"deltaHours"`
	Reason      string  `json:"reason"`
}

type adjustResponse struct {
	AdjustmentID int64                `json:"adjustmentId"`
	DeltaHours   float64              `json:"deltaHours"`
	Balance      leaveBalanceResponse `json:"balance"`
}

// Adjust — POST /api/hr/leave-balances/:user_id/adjust (HR/super_admin only).
func (h *LeaveBalanceHandler) Adjust(c *gin.Context) {
	idStr := c.Param("user_id")
	targetID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || targetID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "user_id", Reason: "format"}})
		return
	}

	var req adjustRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	var fields []apiresult.FieldError
	if req.LeaveTypeID <= 0 {
		fields = append(fields, apiresult.FieldError{Field: "leaveTypeId", Reason: "required"})
	}
	if req.DeltaHours == 0 {
		fields = append(fields, apiresult.FieldError{Field: "deltaHours", Reason: "nonzero"})
	}
	if req.Reason == "" {
		fields = append(fields, apiresult.FieldError{Field: "reason", Reason: "required"})
	}
	if len(fields) > 0 {
		writeValidationFailed(c, fields)
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	res, err := h.svc.Adjust(c.Request.Context(), AdjustInput{
		TenantID:    tenantID,
		ActorUserID: actorID,
		TargetUser:  targetID,
		LeaveTypeID: req.LeaveTypeID,
		PeriodYear:  req.PeriodYear,
		DeltaHours:  req.DeltaHours,
		Reason:      req.Reason,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrAdjustReasonRequired):
			writeValidationFailed(c, []apiresult.FieldError{{Field: "reason", Reason: "required"}})
			return
		case errors.Is(err, ErrAdjustZeroDelta):
			writeValidationFailed(c, []apiresult.FieldError{{Field: "deltaHours", Reason: "nonzero"}})
			return
		case errors.Is(err, ErrLeaveBalanceTargetUserNotFound):
			writeNotFound(c, "대상 사용자를 찾을 수 없습니다.")
			return
		case errors.Is(err, ErrLeaveTypeNotFound):
			writeNotFound(c, "휴가 종류를 찾을 수 없습니다.")
			return
		case errors.Is(err, ErrAdjustNegativeResult):
			c.JSON(http.StatusConflict, apiresult.Failure(
				"조정 결과 잔여가 음수가 됩니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.Conflict},
			))
			return
		}
		writeInternal(c)
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(adjustResponse{
		AdjustmentID: res.AdjustmentID,
		DeltaHours:   res.DeltaHours,
		Balance:      toBalanceResponse(res.Balance),
	}))
}
