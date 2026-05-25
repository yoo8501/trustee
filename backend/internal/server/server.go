// Package server — Gin 엔진 부트스트랩.
//
// HTTP 핸들러 등록, 미들웨어 체인 구성, /health 및 /debug/error 라우트 등록을 한다.
// Sprint 2 부터 auth / users / teams 도메인 핸들러가 본 패키지를 통해 라우터에 부착된다.
package server

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/admin"
	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance"
	"github.com/sjseo/docflow/backend/internal/hr/audit"
	"github.com/sjseo/docflow/backend/internal/hr/holiday"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/httpx/middleware"
	"github.com/sjseo/docflow/backend/internal/permission"
	"github.com/sjseo/docflow/backend/internal/teams"
	"github.com/sjseo/docflow/backend/internal/users"
)

// Config — 서버 부트스트랩 설정. 의존성은 향후 DB/Cron 등 확장 예정.
type Config struct {
	// TenantID 는 단일 조직 운영 단계에서 사용할 기본 tenant id. 보통 1.
	TenantID int64
	// Logger 가 nil 이면 slog.Default() 를 사용한다.
	Logger *slog.Logger

	// Store 는 DB 접근 인터페이스. nil 이면 도메인 라우트(auth/users/teams)는 등록되지 않는다
	// (헬스체크 등 인프라 라우트는 그대로 동작).
	Store DomainStore

	// JWTIssuer 는 access/refresh 토큰 발급/검증기. nil 이면 인증 라우트가 등록되지 않는다.
	JWTIssuer *auth.TokenIssuer
}

// DomainStore — 도메인 핸들러가 사용하는 store. dbq.Queries 가 그대로 만족한다.
// (auth.Store + users.Store + teams.Store + leave/holiday/attendance/audit/admin store 의 합집합.)
type DomainStore interface {
	auth.Store
	users.Store
	teams.Store
	leave.LeaveTypeStore
	leave.LeaveBalanceStore
	holiday.Store
	attendance.Store
	attendance.UserStore
	admin.Store
	audit.Store
}

var _ DomainStore = (*dbq.Queries)(nil)

// NewEngine 은 미들웨어와 기본 라우트가 부착된 Gin 엔진을 만든다.
//
// 미들웨어 순서:
//  1. RequestID — 모든 후속 미들웨어/핸들러가 request_id 를 사용 가능
//  2. Logger    — 요청/응답 구조화 로그
//  3. Recover   — panic 캡처
//  4. Tenant    — context 에 tenant id 주입
//
// 라우트:
//   - /health, /debug/error (Sprint 1)
//   - /api/auth/{register,login,refresh,logout}
//   - /api/users/{me,list,update}
//   - /api/teams, /api/teams/:id, /api/teams/{list,update,delete}
func NewEngine(cfg Config) (*gin.Engine, error) {
	if cfg.TenantID == 0 {
		cfg.TenantID = 1
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	eng := gin.New()
	eng.Use(
		middleware.RequestID(),
		middleware.Logger(logger),
		middleware.Recover(),
		middleware.Tenant(cfg.TenantID),
	)

	// 헬스체크 - 단순 liveness probe. Sprint 1 단계에서 DB 의존 없음.
	eng.GET("/health", func(c *gin.Context) {
		type healthData struct {
			Status string `json:"status"`
		}
		c.JSON(http.StatusOK, apiresult.Success(healthData{Status: "ok"}))
	})

	// 의도된 실패 라우트 - ApiResult 실패 envelope shape 와 INTERNAL_ERROR 매핑 검증용.
	// 운영 환경에서는 본 라우트를 제거하거나 dev 전용 그룹으로 격리할 예정.
	eng.GET("/debug/error", func(c *gin.Context) {
		reqID := middleware.RequestIDFrom(c.Request.Context())
		c.JSON(http.StatusInternalServerError, apiresult.Failure(
			"의도된 디버그 에러입니다.",
			&apiresult.ErrorDetails{
				ErrorCode: errorcode.InternalError,
				TraceID:   reqID,
			},
		))
	})

	// 도메인 라우트는 store / issuer 가 모두 있을 때만 등록.
	if cfg.Store != nil && cfg.JWTIssuer != nil {
		registerDomainRoutes(eng, cfg)
	}

	return eng, nil
}

func registerDomainRoutes(eng *gin.Engine, cfg Config) {
	authSvc := auth.NewService(cfg.Store, cfg.JWTIssuer, cfg.TenantID)
	authH := auth.NewHandler(authSvc)
	authMW := auth.NewMiddleware(cfg.JWTIssuer, cfg.Store)

	userSvc := users.NewService(cfg.Store)
	userH := users.NewHandler(userSvc)

	teamSvc := teams.NewService(cfg.Store)
	teamH := teams.NewHandler(teamSvc)

	api := eng.Group("/api")

	// ---- auth ----
	authGrp := api.Group("/auth")
	authGrp.POST("/register", authH.Register)
	authGrp.POST("/login", authH.Login)
	authGrp.POST("/refresh", authH.Refresh)
	authGrp.POST("/logout", authMW.Required(), authH.Logout)

	// ---- users ----
	api.GET("/users/me", authMW.Required(), userH.Me)
	api.POST("/users/list",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		userH.List,
	)
	api.POST("/users/update",
		authMW.Required(),
		authMW.RequireRole(permission.RoleSuperAdmin),
		userH.Update,
	)

	// ---- teams ----
	api.GET("/teams/:id", authMW.Required(), teamH.Get)
	api.POST("/teams/list", authMW.Required(), teamH.List)
	api.POST("/teams",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		teamH.Create,
	)
	api.POST("/teams/update",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		teamH.Update,
	)
	api.POST("/teams/delete",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		teamH.Delete,
	)

	// ---- HR: leave types ----
	leaveTypeSvc := leave.NewLeaveTypeService(cfg.Store)
	leaveTypeH := leave.NewLeaveTypeHandler(leaveTypeSvc)
	api.GET("/hr/leave-types/:id", authMW.Required(), leaveTypeH.Get)
	api.POST("/hr/leave-types/list", authMW.Required(), leaveTypeH.List)
	api.POST("/hr/leave-types",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		leaveTypeH.Create,
	)
	api.POST("/hr/leave-types/update",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		leaveTypeH.Update,
	)
	api.POST("/hr/leave-types/delete",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		leaveTypeH.Delete,
	)

	// ---- HR: leave balances ----
	leaveBalSvc := leave.NewLeaveBalanceService(cfg.Store)
	leaveBalH := leave.NewLeaveBalanceHandler(leaveBalSvc)
	api.GET("/hr/leave-balances/me", authMW.Required(), leaveBalH.Me)
	api.POST("/hr/leave-balances/:user_id/adjust",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		leaveBalH.Adjust,
	)

	// ---- HR: holidays ----
	holidaySvc := holiday.NewService(cfg.Store)
	holidayH := holiday.NewHandler(holidaySvc)
	api.POST("/hr/holidays/list", authMW.Required(), holidayH.List)

	// ---- HR: attendance (출퇴근) ----
	// Sprint 4: 본인의 출근/퇴근만 처리. team_lead/HR 조회 API 는 Sprint 5.
	attendanceSvc := attendance.NewService(cfg.Store, cfg.Store)
	attendanceH := attendance.NewHandler(attendanceSvc)
	api.POST("/hr/attendance/check-in", authMW.Required(), attendanceH.CheckIn)
	api.POST("/hr/attendance/check-out", authMW.Required(), attendanceH.CheckOut)

	// ---- admin: user soft delete (Sprint 9) ----
	// super_admin only. status='terminated' + token_version++ 동시 적용.
	adminSvc := admin.NewService(cfg.Store)
	adminH := admin.NewHandler(adminSvc)
	api.POST("/users/terminate",
		authMW.Required(),
		authMW.RequireRole(permission.RoleSuperAdmin),
		adminH.Terminate,
	)

	// ---- HR: audit (출퇴근 감사 로그, Sprint 9) ----
	// HR + super_admin only. attendance_records SELECT only.
	auditSvc := audit.NewService(cfg.Store)
	auditH := audit.NewHandler(auditSvc)
	api.POST("/hr/audit/attendance/list",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		auditH.AttendanceList,
	)
}
