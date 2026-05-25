package calendar

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — /api/hr/calendar.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type listRequest struct {
	From  string `json:"from"`  // YYYY-MM-DD (KST)
	To    string `json:"to"`    // YYYY-MM-DD (KST)
	Scope string `json:"scope"` // me | team | all
}

type calendarLeaveResponse struct {
	ID            int64   `json:"id"`
	RequesterID   int64   `json:"requesterId"`
	RequesterName string  `json:"requesterName"`
	LeaveTypeID   int64   `json:"leaveTypeId"`
	LeaveTypeCode string  `json:"leaveTypeCode"`
	LeaveTypeName string  `json:"leaveTypeName"`
	StartAt       string  `json:"startAt"`
	EndAt         string  `json:"endAt"`
	Hours         float64 `json:"hours"`
	Status        string  `json:"status"`
	ApproverID    int64   `json:"approverId,omitempty"`
	Reason        *string `json:"reason,omitempty"`
}

type calendarHolidayResponse struct {
	ID          int64  `json:"id"`
	Date        string `json:"date"`
	Name        string `json:"name"`
	IsRecurring bool   `json:"isRecurring"`
	CountryCode string `json:"countryCode"`
}

type calendarAttendanceResponse struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"userId"`
	WorkDate   string  `json:"workDate"`
	CheckInAt  *string `json:"checkInAt,omitempty"`
	CheckOutAt *string `json:"checkOutAt,omitempty"`
	Status     string  `json:"status"`
}

type calendarResponse struct {
	Leaves      []calendarLeaveResponse      `json:"leaves"`
	Holidays    []calendarHolidayResponse    `json:"holidays"`
	Attendances []calendarAttendanceResponse `json:"attendances"`
}

// ---------- List ----------

// List — POST /api/hr/calendar/list.
//
// body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", scope: "me|team|all" }
// 응답: ApiResult<{ leaves, holidays, attendances }>.
func (h *Handler) List(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)

	// 필수 필드 검증.
	var fields []apiresult.FieldError
	if req.From == "" {
		fields = append(fields, apiresult.FieldError{Field: "from", Reason: "required"})
	}
	if req.To == "" {
		fields = append(fields, apiresult.FieldError{Field: "to", Reason: "required"})
	}
	if len(fields) > 0 {
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"입력값을 확인해 주세요.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.ValidationFailed, Fields: fields},
		))
		return
	}

	// 날짜 파싱 (KST).
	loc := leave.KSTLocation()
	from, errFrom := time.ParseInLocation("2006-01-02", req.From, loc)
	to, errTo := time.ParseInLocation("2006-01-02", req.To, loc)
	if errFrom != nil || errTo != nil {
		var f []apiresult.FieldError
		if errFrom != nil {
			f = append(f, apiresult.FieldError{Field: "from", Reason: "format"})
		}
		if errTo != nil {
			f = append(f, apiresult.FieldError{Field: "to", Reason: "format"})
		}
		c.JSON(http.StatusBadRequest, apiresult.Failure(
			"날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).",
			&apiresult.ErrorDetails{ErrorCode: errorcode.ValidationFailed, Fields: f},
		))
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)
	role, _ := auth.RoleFrom(c)

	scope := Scope(req.Scope)
	if scope == "" {
		scope = ScopeAll
	}

	res, err := h.svc.List(c.Request.Context(), ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     role,
		From:     from,
		To:       to,
		Scope:    scope,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrDateRangeTooLarge):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"조회 기간이 너무 깁니다 (최대 3개월).",
				&apiresult.ErrorDetails{ErrorCode: errorcode.DateRangeTooLarge},
			))
		case errors.Is(err, ErrInvalidDateRange):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"조회 기간이 올바르지 않습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidDateRange},
			))
		default:
			c.JSON(http.StatusInternalServerError, apiresult.Failure(
				"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
			))
		}
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(toResponse(res)))
}

func toResponse(r Response) calendarResponse {
	out := calendarResponse{
		Leaves:      make([]calendarLeaveResponse, 0, len(r.Leaves)),
		Holidays:    make([]calendarHolidayResponse, 0, len(r.Holidays)),
		Attendances: make([]calendarAttendanceResponse, 0, len(r.Attendances)),
	}
	for _, l := range r.Leaves {
		out.Leaves = append(out.Leaves, calendarLeaveResponse{
			ID:            l.ID,
			RequesterID:   l.RequesterID,
			RequesterName: l.RequesterName,
			LeaveTypeID:   l.LeaveTypeID,
			LeaveTypeCode: l.LeaveTypeCode,
			LeaveTypeName: l.LeaveTypeName,
			StartAt:       l.StartAt.Format(time.RFC3339),
			EndAt:         l.EndAt.Format(time.RFC3339),
			Hours:         l.Hours,
			Status:        l.Status,
			ApproverID:    l.ApproverID,
			Reason:        l.Reason,
		})
	}
	for _, h := range r.Holidays {
		out.Holidays = append(out.Holidays, calendarHolidayResponse{
			ID:          h.ID,
			Date:        h.Date.Format("2006-01-02"),
			Name:        h.Name,
			IsRecurring: h.IsRecurring,
			CountryCode: h.CountryCode,
		})
	}
	for _, a := range r.Attendances {
		v := calendarAttendanceResponse{
			ID:       a.ID,
			UserID:   a.UserID,
			WorkDate: a.WorkDate.Format("2006-01-02"),
			Status:   a.Status,
		}
		if a.CheckInAt != nil {
			s := a.CheckInAt.Format(time.RFC3339)
			v.CheckInAt = &s
		}
		if a.CheckOutAt != nil {
			s := a.CheckOutAt.Format(time.RFC3339)
			v.CheckOutAt = &s
		}
		out.Attendances = append(out.Attendances, v)
	}
	return out
}
