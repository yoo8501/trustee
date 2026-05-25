package stats

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Handler — /api/hr/attendance/{me,team,all}/stats.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---- DTO ----

type statsRequest struct {
	Period string `json:"period" binding:"required,oneof=day week month"`
	Date   string `json:"date" binding:"required"` // YYYY-MM-DD
}

type periodResponse struct {
	From                 string  `json:"from"`
	To                   string  `json:"to"`
	TotalActualMinutes   int     `json:"totalActualMinutes"`
	TotalOvertimeMinutes int     `json:"totalOvertimeMinutes"`
	TotalExpectedMinutes int     `json:"totalExpectedMinutes"`
	DaysPresent          int     `json:"daysPresent"`
	DaysLate             int     `json:"daysLate"`
	DaysEarlyLeave       int     `json:"daysEarlyLeave"`
	DaysAutoClosed       int     `json:"daysAutoClosed"`
	DaysAbsent           int     `json:"daysAbsent"`
	BusinessDays         int     `json:"businessDays"`
	AttendanceRate       float64 `json:"attendanceRate"`
}

type recordResponse struct {
	Date                    string  `json:"date"` // YYYY-MM-DD
	Status                  string  `json:"status"`
	CheckIn                 *string `json:"checkIn,omitempty"`  // RFC3339
	CheckOut                *string `json:"checkOut,omitempty"` // RFC3339
	LunchBreakMinutes       int     `json:"lunchBreakMinutes"`
	ExpectedMinutes         int     `json:"expectedMinutes"`
	ActualWorkMinutes       int     `json:"actualWorkMinutes"`
	LeaveAdjustmentHours    float64 `json:"leaveAdjustmentHours"`
	AdjustedExpectedMinutes int     `json:"adjustedExpectedMinutes"`
	OvertimeMinutes         int     `json:"overtimeMinutes"`
}

type memberResponse struct {
	UserID               int64   `json:"userId"`
	TotalActualMinutes   int     `json:"totalActualMinutes"`
	TotalOvertimeMinutes int     `json:"totalOvertimeMinutes"`
	DaysPresent          int     `json:"daysPresent"`
	DaysLate             int     `json:"daysLate"`
	DaysEarlyLeave       int     `json:"daysEarlyLeave"`
	DaysAutoClosed       int     `json:"daysAutoClosed"`
	AttendanceRate       float64 `json:"attendanceRate"`
}

type mineResponse struct {
	Period  periodResponse   `json:"period"`
	Records []recordResponse `json:"records"`
}

type teamResponse struct {
	Period  periodResponse   `json:"period"`
	Members []memberResponse `json:"members"`
}

// ---- Mine ----

// Mine — POST /api/hr/attendance/me/stats.
//
// 본인의 일/주/월 통계. 모든 인증된 사용자가 호출 가능.
func (h *Handler) Mine(c *gin.Context) {
	actor, ok := actorFrom(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}

	var req statsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeValidationFailed(c, "period", "oneof")
		return
	}
	date, err := parseDate(req.Date)
	if err != nil {
		writeValidationFailed(c, "date", "format")
		return
	}

	res, err := h.svc.Mine(c.Request.Context(), actor, req.Period, date)
	if err != nil {
		writeServiceErr(c, err)
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(mineResponse{
		Period:  toPeriodResponse(res.Period),
		Records: toRecordResponses(res.Records),
	}))
}

// ---- Team ----

// Team — POST /api/hr/attendance/team/:teamId/stats.
//
// team_lead+ 만 호출. team_lead = 자기 팀, dept_head = 산하 팀, HR+ = 전사 임의 팀.
// 권한 위반은 service 가 ErrForbidden 반환 → 403.
func (h *Handler) Team(c *gin.Context) {
	actor, ok := actorFrom(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}

	teamIDStr := c.Param("teamId")
	var teamIDPtr *int64
	if teamIDStr != "" {
		v, err := strconv.ParseInt(teamIDStr, 10, 64)
		if err != nil {
			writeValidationFailed(c, "teamId", "format")
			return
		}
		teamIDPtr = &v
	}

	var req statsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeValidationFailed(c, "period", "oneof")
		return
	}
	date, err := parseDate(req.Date)
	if err != nil {
		writeValidationFailed(c, "date", "format")
		return
	}

	res, err := h.svc.Team(c.Request.Context(), actor, teamIDPtr, req.Period, date)
	if err != nil {
		writeServiceErr(c, err)
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(teamResponse{
		Period:  toPeriodResponse(res.Period),
		Members: toMemberResponses(res.Members),
	}))
}

// ---- All ----

// All — POST /api/hr/attendance/all/stats.
//
// HR/super_admin only. 라우터 미들웨어가 1차 차단 + service Scope 검증이 2차 방어.
func (h *Handler) All(c *gin.Context) {
	actor, ok := actorFrom(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}

	var req statsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeValidationFailed(c, "period", "oneof")
		return
	}
	date, err := parseDate(req.Date)
	if err != nil {
		writeValidationFailed(c, "date", "format")
		return
	}

	res, err := h.svc.All(c.Request.Context(), actor, req.Period, date)
	if err != nil {
		writeServiceErr(c, err)
		return
	}

	c.JSON(http.StatusOK, apiresult.Success(teamResponse{
		Period:  toPeriodResponse(res.Period),
		Members: toMemberResponses(res.Members),
	}))
}

// ---- helpers ----

// actorFrom — JWT 미들웨어가 주입한 user id/role/tenant_id + (옵션) team_id.
// team_id 는 stats 라우트만 사용하는 context key 이므로 없으면 0 으로 default.
func actorFrom(c *gin.Context) (scope.Actor, bool) {
	uid, ok := auth.UserIDFrom(c)
	if !ok {
		return scope.Actor{}, false
	}
	role, _ := auth.RoleFrom(c)
	tid, _ := auth.TenantIDFrom(c)

	teamID := int64(0)
	if v, exists := c.Get("auth:team_id"); exists {
		if tv, ok := v.(int64); ok {
			teamID = tv
		}
	}

	return scope.Actor{ID: uid, TenantID: tid, Role: role, TeamID: teamID}, true
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}

func toPeriodResponse(p PeriodStats) periodResponse {
	return periodResponse{
		From:                 p.From.Format("2006-01-02"),
		To:                   p.To.Format("2006-01-02"),
		TotalActualMinutes:   p.TotalActualMinutes,
		TotalOvertimeMinutes: p.TotalOvertimeMinutes,
		TotalExpectedMinutes: p.TotalExpectedMinutes,
		DaysPresent:          p.DaysPresent,
		DaysLate:             p.DaysLate,
		DaysEarlyLeave:       p.DaysEarlyLeave,
		DaysAutoClosed:       p.DaysAutoClosed,
		DaysAbsent:           p.DaysAbsent,
		BusinessDays:         p.BusinessDays,
		AttendanceRate:       p.AttendanceRate,
	}
}

func toRecordResponses(records []RecordStats) []recordResponse {
	out := make([]recordResponse, 0, len(records))
	for _, r := range records {
		item := recordResponse{
			Date:                    r.Date.Format("2006-01-02"),
			Status:                  r.Status,
			LunchBreakMinutes:       r.LunchBreakMinutes,
			ExpectedMinutes:         r.ExpectedMinutes,
			ActualWorkMinutes:       r.ActualWorkMinutes,
			LeaveAdjustmentHours:    r.LeaveAdjustmentHours,
			AdjustedExpectedMinutes: r.AdjustedExpectedMinutes,
			OvertimeMinutes:         r.OvertimeMinutes,
		}
		if r.CheckIn != nil {
			s := r.CheckIn.Format(time.RFC3339)
			item.CheckIn = &s
		}
		if r.CheckOut != nil {
			s := r.CheckOut.Format(time.RFC3339)
			item.CheckOut = &s
		}
		out = append(out, item)
	}
	return out
}

func toMemberResponses(members []TeamMember) []memberResponse {
	out := make([]memberResponse, 0, len(members))
	for _, m := range members {
		out = append(out, memberResponse{
			UserID:               m.UserID,
			TotalActualMinutes:   m.TotalActualMinutes,
			TotalOvertimeMinutes: m.TotalOvertimeMinutes,
			DaysPresent:          m.DaysPresent,
			DaysLate:             m.DaysLate,
			DaysEarlyLeave:       m.DaysEarlyLeave,
			DaysAutoClosed:       m.DaysAutoClosed,
			AttendanceRate:       m.AttendanceRate,
		})
	}
	return out
}

func writeUnauthenticated(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, apiresult.Failure(
		"인증이 필요합니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
	))
}

func writeValidationFailed(c *gin.Context, field, reason string) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"입력값을 확인해 주세요.",
		&apiresult.ErrorDetails{
			ErrorCode: errorcode.ValidationFailed,
			Fields:    []apiresult.FieldError{{Field: field, Reason: reason}},
		},
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

func writeServiceErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, scope.ErrForbidden):
		writeForbidden(c)
	case errors.Is(err, ErrUserNotFound):
		c.JSON(http.StatusNotFound, apiresult.Failure(
			"사용자를 찾을 수 없습니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
		))
	case errors.Is(err, ErrInvalidPeriod):
		writeValidationFailed(c, "period", "oneof")
	default:
		writeInternal(c)
	}
}

// 패키지 import 가드 (permission 패키지가 actorFrom 외 직접 사용은 없어도 godoc 링크용).
var _ = permission.RoleGeneral
