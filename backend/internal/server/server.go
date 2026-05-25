// Package server — Gin 엔진 부트스트랩.
//
// HTTP 핸들러 등록, 미들웨어 체인 구성, /health 및 /debug/error 라우트 등록을 한다.
// Sprint 2 부터 auth / users / teams 도메인 핸들러가 본 패키지를 통해 라우터에 부착된다.
package server

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/admin"
	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/audit"
	"github.com/sjseo/docflow/backend/internal/hr/delegation"
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
	"github.com/sjseo/docflow/backend/internal/hr/holiday"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
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

	// Pool — Sprint 6 LeaveRequest Approve 트랜잭션에 사용. nil 이면 leave-requests 라우트는
	// 등록되지 않는다 (다른 도메인은 영향 없음).
	Pool *pgxpool.Pool
}

// DomainStore — 도메인 핸들러가 사용하는 store. dbq.Queries 가 그대로 만족한다.
// (auth.Store + users.Store + teams.Store + leave/holiday/attendance/audit/admin/leaverequest/delegation store 의 합집합.)
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
	stats.SQLCQuerier
	stats.LeaveQuerier
	scope.HierarchyQuerier
	leaverequest.Store
	leaverequest.TxStore
	delegation.Store
	expensereport.Store
	expensereport.TxStore
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
	// Sprint 4: 본인의 출근/퇴근만 처리.
	attendanceSvc := attendance.NewService(cfg.Store, cfg.Store)
	attendanceH := attendance.NewHandler(attendanceSvc)
	api.POST("/hr/attendance/check-in", authMW.Required(), attendanceH.CheckIn)
	api.POST("/hr/attendance/check-out", authMW.Required(), attendanceH.CheckOut)

	// ---- HR: attendance stats (Sprint 5 + Sprint 6 leave swap) ----
	// me / team / all 통계 — Scoped Querier 가 권한 강제 + Repository 단에서 tenant scope.
	// Sprint 6: NoopLeaveAdjustmentFetcher → SQLLeaveAdjustmentFetcher 로 교체.
	statsAttStore := stats.NewSQLAttendanceStore(cfg.Store)
	statsUserStore := stats.NewSQLUserStore(cfg.Store)
	statsHierarchy := scope.NewSQLHierarchy(cfg.Store)
	leaveFetcher := stats.NewSQLLeaveAdjustmentFetcher(cfg.Store, cfg.TenantID)
	statsSvc := stats.NewService(statsAttStore, statsUserStore, cfg.Store, statsHierarchy, leaveFetcher)
	statsH := stats.NewHandler(statsSvc)

	// /me : 모든 인증 사용자 본인 통계.
	api.POST("/hr/attendance/me/stats",
		authMW.Required(),
		statsTeamContext(cfg.Store, cfg.TenantID),
		statsH.Mine,
	)
	// /team/:teamId : team_lead+ (자기 팀) — Scoped Querier 가 dept_head 산하까지 펼침.
	api.POST("/hr/attendance/team/:teamId/stats",
		authMW.Required(),
		authMW.RequireAtLeast(permission.RoleTeamLead),
		statsTeamContext(cfg.Store, cfg.TenantID),
		statsH.Team,
	)
	// /all : HR / super_admin only.
	api.POST("/hr/attendance/all/stats",
		authMW.Required(),
		authMW.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		statsTeamContext(cfg.Store, cfg.TenantID),
		statsH.All,
	)

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

	// ---- HR: delegations (Sprint 6, 결재 위임) ----
	delegResolver := delegation.NewResolver(cfg.Store, cfg.TenantID)
	delegSvc := delegation.NewService(cfg.Store)
	delegH := delegation.NewHandler(delegSvc)
	api.POST("/hr/delegations", authMW.Required(), delegH.Create)
	api.POST("/hr/delegations/me/list", authMW.Required(), delegH.MyList)
	api.POST("/hr/delegations/delete", authMW.Required(), delegH.Delete)

	// ---- HR: leave-requests (Sprint 6, 휴가 신청 단일 결재) ----
	// Approve 가 트랜잭션을 필요로 하므로 Pool 이 있을 때만 등록.
	if cfg.Pool != nil {
		txMgr := leaverequest.NewPgxTxManager(cfg.Pool)
		leaveReqSvc := leaverequest.NewService(cfg.Store, txMgr, delegResolver)
		leaveReqH := leaverequest.NewHandler(leaveReqSvc)
		leaveReq := api.Group("/hr/leave-requests", authMW.Required())
		leaveReq.POST("", leaveReqH.Create)
		leaveReq.GET("/:id", leaveReqH.Get)
		leaveReq.POST("/me/list", leaveReqH.MyList)
		leaveReq.POST("/pending/list",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			leaveReqH.PendingList,
		)
		leaveReq.POST("/:id/approve",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			leaveReqH.Approve,
		)
		leaveReq.POST("/:id/reject",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			leaveReqH.Reject,
		)
		leaveReq.POST("/:id/cancel", leaveReqH.Cancel)
	}

	// ---- HR: expense-reports (Sprint 7, 지출결의서 단일 결재 + 첨부) ----
	// Approve/Reject 가 트랜잭션을 요구하므로 Pool 이 있을 때만 등록.
	if cfg.Pool != nil {
		expTxMgr := expensereport.NewPgxTxManager(cfg.Pool)
		expSvc := expensereport.NewService(cfg.Store, expTxMgr, delegResolver)
		uploadDir := os.Getenv("UPLOAD_DIR")
		if uploadDir == "" {
			uploadDir = "./uploads"
		}
		expStorage := expensereport.NewLocalAttachmentStorage(uploadDir)
		expAttach := expensereport.NewAttachmentManager(expStorage)
		expH := expensereport.NewHandler(expSvc, expAttach)

		expGrp := api.Group("/hr/expense-reports", authMW.Required())
		expGrp.POST("", expH.Create)
		expGrp.GET("/:id", expH.Get)
		expGrp.POST("/me/list", expH.MyList)
		expGrp.POST("/pending/list",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			expH.PendingList,
		)
		expGrp.POST("/:id/approve",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			expH.Approve,
		)
		expGrp.POST("/:id/reject",
			authMW.RequireAtLeast(permission.RoleTeamLead),
			expH.Reject,
		)
		expGrp.POST("/:id/cancel", expH.Cancel)
		expGrp.POST("/:id/attachment", expH.Upload)
		expGrp.GET("/:id/attachment", expH.Download)
	}
}

// statsTeamContext — Sprint 5 stats 핸들러용 미들웨어.
//
// JWT 미들웨어가 user/role/tenant 만 주입하므로, stats.Handler 가 [scope.Actor] 구성에
// 필요한 actor.TeamID 를 user 테이블에서 한 번 조회해 c.Set("auth:team_id", ...) 한다.
// DB 1회 lookup 비용은 통계 API 빈도가 낮아 허용 (P2 이후 JWT claims 에 teamId 포함 검토).
func statsTeamContext(store interface {
	GetUserByID(ctx gincontext, arg dbq.GetUserByIDParams) (dbq.User, error)
}, defaultTenant int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, ok := auth.UserIDFrom(c)
		if !ok {
			c.Next()
			return
		}
		tid, _ := auth.TenantIDFrom(c)
		if tid == 0 {
			tid = defaultTenant
		}
		u, err := store.GetUserByID(c.Request.Context(), dbq.GetUserByIDParams{ID: uid, TenantID: tid})
		if err == nil && u.TeamID.Valid {
			c.Set("auth:team_id", u.TeamID.Int64)
		}
		c.Next()
	}
}

// gincontext — store 인터페이스 매개변수가 context.Context 인 것을 만족시키기 위한 alias.
type gincontext = context.Context
