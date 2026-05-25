package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/server"
)

// ---- 통합 테스트용 fakeStore — auth + users + teams 모두 만족. ----

type fakeStore struct {
	users         map[int64]dbq.User
	usersByEmail  map[string]int64
	nextUserID    int64
	teams         map[int64]dbq.Team
	nextTeamID    int64
	refreshTokens map[[16]byte]dbq.RefreshToken
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		users:         map[int64]dbq.User{},
		usersByEmail:  map[string]int64{},
		teams:         map[int64]dbq.Team{},
		refreshTokens: map[[16]byte]dbq.RefreshToken{},
	}
}

func (f *fakeStore) emailKey(tid int64, email string) string {
	return string(rune(tid)) + ":" + email
}

func (f *fakeStore) GetUserByEmail(ctx context.Context, arg dbq.GetUserByEmailParams) (dbq.User, error) {
	id, ok := f.usersByEmail[f.emailKey(arg.TenantID, arg.Email)]
	if !ok {
		return dbq.User{}, pgx.ErrNoRows
	}
	u := f.users[id]
	if u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) CreateUser(ctx context.Context, arg dbq.CreateUserParams) (dbq.User, error) {
	key := f.emailKey(arg.TenantID, arg.Email)
	if _, exists := f.usersByEmail[key]; exists {
		return dbq.User{}, &pgconn.PgError{Code: "23505"}
	}
	f.nextUserID++
	u := dbq.User{
		ID: f.nextUserID, TenantID: arg.TenantID, Email: arg.Email,
		PasswordHash: arg.PasswordHash, Name: arg.Name,
		Status: dbq.UserStatusActive, Role: arg.Role,
		TeamID: arg.TeamID, ManagerID: arg.ManagerID, HireDate: arg.HireDate,
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.users[u.ID] = u
	f.usersByEmail[key] = u.ID
	return u, nil
}

func (f *fakeStore) ListUsers(ctx context.Context, arg dbq.ListUsersParams) ([]dbq.User, error) {
	var out []dbq.User
	for _, u := range f.users {
		if u.TenantID == arg.TenantID && !u.DeletedAt.Valid {
			out = append(out, u)
		}
	}
	return out, nil
}

func (f *fakeStore) CountUsers(ctx context.Context, tid int64) (int64, error) {
	var n int64
	for _, u := range f.users {
		if u.TenantID == tid && !u.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) UpdateUser(ctx context.Context, arg dbq.UpdateUserParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok {
		return dbq.User{}, pgx.ErrNoRows
	}
	if arg.Name.Valid {
		u.Name = arg.Name.String
	}
	if arg.Role.Valid {
		u.Role = arg.Role.UserRole
	}
	if arg.TeamIDSet {
		u.TeamID = arg.TeamID
	}
	if arg.ManagerIDSet {
		u.ManagerID = arg.ManagerID
	}
	if arg.Status.Valid {
		u.Status = arg.Status.UserStatus
	}
	f.users[u.ID] = u
	return u, nil
}

func (f *fakeStore) IncrementUserTokenVersion(ctx context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error) {
	u, ok := f.users[arg.ID]
	if !ok {
		return 0, pgx.ErrNoRows
	}
	u.TokenVersion++
	f.users[u.ID] = u
	return u.TokenVersion, nil
}

func (f *fakeStore) GetUserTokenVersion(ctx context.Context, arg dbq.GetUserTokenVersionParams) (dbq.GetUserTokenVersionRow, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.GetUserTokenVersionRow{}, pgx.ErrNoRows
	}
	return dbq.GetUserTokenVersionRow{TokenVersion: u.TokenVersion, Status: u.Status, Role: u.Role}, nil
}

func (f *fakeStore) CreateRefreshToken(ctx context.Context, arg dbq.CreateRefreshTokenParams) error {
	f.refreshTokens[arg.Jti.Bytes] = dbq.RefreshToken{
		Jti: arg.Jti, UserID: arg.UserID, TenantID: arg.TenantID,
		IssuedAt: arg.IssuedAt, ExpiresAt: arg.ExpiresAt,
	}
	return nil
}

func (f *fakeStore) GetRefreshToken(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error) {
	rec, ok := f.refreshTokens[jti.Bytes]
	if !ok {
		return dbq.RefreshToken{}, pgx.ErrNoRows
	}
	return rec, nil
}

func (f *fakeStore) MarkRefreshTokenUsed(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error) {
	rec, ok := f.refreshTokens[jti.Bytes]
	if !ok || rec.UsedAt.Valid {
		return dbq.RefreshToken{}, pgx.ErrNoRows
	}
	rec.UsedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.refreshTokens[jti.Bytes] = rec
	return rec, nil
}

// teams.Store
func (f *fakeStore) GetTeamByID(ctx context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return dbq.Team{}, pgx.ErrNoRows
	}
	return t, nil
}

func (f *fakeStore) ListTeams(ctx context.Context, arg dbq.ListTeamsParams) ([]dbq.Team, error) {
	var out []dbq.Team
	for _, t := range f.teams {
		if t.TenantID == arg.TenantID && !t.DeletedAt.Valid {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeStore) CountTeams(ctx context.Context, tid int64) (int64, error) {
	var n int64
	for _, t := range f.teams {
		if t.TenantID == tid && !t.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) CreateTeam(ctx context.Context, arg dbq.CreateTeamParams) (dbq.Team, error) {
	f.nextTeamID++
	t := dbq.Team{ID: f.nextTeamID, TenantID: arg.TenantID, Name: arg.Name}
	f.teams[t.ID] = t
	return t, nil
}

func (f *fakeStore) UpdateTeam(ctx context.Context, arg dbq.UpdateTeamParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok {
		return dbq.Team{}, pgx.ErrNoRows
	}
	if arg.Name.Valid {
		t.Name = arg.Name.String
	}
	f.teams[t.ID] = t
	return t, nil
}

func (f *fakeStore) SoftDeleteTeam(ctx context.Context, arg dbq.SoftDeleteTeamParams) error {
	t, ok := f.teams[arg.ID]
	if !ok {
		return nil
	}
	t.DeletedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.teams[t.ID] = t
	return nil
}

// ---- leave_types / leave_balances / holidays / leave_balance_adjustments ----
// 본 통합 테스트는 라우팅 + 권한 미들웨어가 주관심사이므로 메모리 모킹은 최소.
// 도메인 동작 검증은 hr/leave, hr/holiday 패키지 단위 테스트에서 한다.

func (f *fakeStore) GetLeaveTypeByID(ctx context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error) {
	return dbq.LeaveType{}, pgx.ErrNoRows
}

func (f *fakeStore) GetLeaveTypeByCode(ctx context.Context, arg dbq.GetLeaveTypeByCodeParams) (dbq.LeaveType, error) {
	return dbq.LeaveType{}, pgx.ErrNoRows
}

func (f *fakeStore) ListLeaveTypes(ctx context.Context, arg dbq.ListLeaveTypesParams) ([]dbq.LeaveType, error) {
	return []dbq.LeaveType{}, nil
}

func (f *fakeStore) CountLeaveTypes(ctx context.Context, tenantID int64) (int64, error) {
	return 0, nil
}

func (f *fakeStore) CreateLeaveType(ctx context.Context, arg dbq.CreateLeaveTypeParams) (dbq.LeaveType, error) {
	return dbq.LeaveType{ID: 1, TenantID: arg.TenantID, Code: arg.Code, Name: arg.Name,
		DefaultHours: arg.DefaultHours, AccrualPolicy: arg.AccrualPolicy,
		IsPaid: arg.IsPaid, IsActive: arg.IsActive}, nil
}

func (f *fakeStore) UpdateLeaveType(ctx context.Context, arg dbq.UpdateLeaveTypeParams) (dbq.LeaveType, error) {
	return dbq.LeaveType{}, pgx.ErrNoRows
}

func (f *fakeStore) SoftDeleteLeaveType(ctx context.Context, arg dbq.SoftDeleteLeaveTypeParams) error {
	return nil
}

func (f *fakeStore) GetLeaveBalanceByID(ctx context.Context, arg dbq.GetLeaveBalanceByIDParams) (dbq.LeaveBalance, error) {
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeStore) GetLeaveBalanceForUserTypeYear(ctx context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error) {
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeStore) ListLeaveBalancesByUser(ctx context.Context, arg dbq.ListLeaveBalancesByUserParams) ([]dbq.LeaveBalance, error) {
	return []dbq.LeaveBalance{}, nil
}

func (f *fakeStore) UpsertLeaveBalanceGrant(ctx context.Context, arg dbq.UpsertLeaveBalanceGrantParams) (dbq.LeaveBalance, error) {
	return dbq.LeaveBalance{ID: 1, TenantID: arg.TenantID, UserID: arg.UserID,
		LeaveTypeID: arg.LeaveTypeID, PeriodYear: arg.PeriodYear,
		GrantedHours: arg.GrantedHours, ExpiresAt: arg.ExpiresAt}, nil
}

func (f *fakeStore) AdjustLeaveBalanceHours(ctx context.Context, arg dbq.AdjustLeaveBalanceHoursParams) (dbq.LeaveBalance, error) {
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeStore) CreateLeaveBalanceAdjustment(ctx context.Context, arg dbq.CreateLeaveBalanceAdjustmentParams) (dbq.LeaveBalanceAdjustment, error) {
	return dbq.LeaveBalanceAdjustment{ID: 1, TenantID: arg.TenantID, BalanceID: arg.BalanceID,
		ActorUserID: arg.ActorUserID, DeltaHours: arg.DeltaHours, Reason: arg.Reason}, nil
}

func (f *fakeStore) GetHolidayByID(ctx context.Context, arg dbq.GetHolidayByIDParams) (dbq.Holiday, error) {
	return dbq.Holiday{}, pgx.ErrNoRows
}

func (f *fakeStore) ListHolidays(ctx context.Context, tenantID int64) ([]dbq.Holiday, error) {
	return []dbq.Holiday{}, nil
}

func (f *fakeStore) ListHolidaysInRange(ctx context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	return []dbq.Holiday{}, nil
}

func (f *fakeStore) CountHolidays(ctx context.Context, tenantID int64) (int64, error) {
	return 0, nil
}

// ---- attendance stub ----
//
// Sprint 4: 통합 테스트는 attendance 라우트를 직접 호출하지 않으므로 안전한 default 만 반환.
// 실제 attendance 동작은 internal/hr/attendance 단위 테스트에서 검증.

func (f *fakeStore) GetAttendanceByUserDate(ctx context.Context, arg dbq.GetAttendanceByUserDateParams) (dbq.AttendanceRecord, error) {
	return dbq.AttendanceRecord{}, pgx.ErrNoRows
}

func (f *fakeStore) CreateAttendanceCheckIn(ctx context.Context, arg dbq.CreateAttendanceCheckInParams) (dbq.AttendanceRecord, error) {
	return dbq.AttendanceRecord{}, nil
}

func (f *fakeStore) UpdateAttendanceCheckOut(ctx context.Context, arg dbq.UpdateAttendanceCheckOutParams) (dbq.AttendanceRecord, error) {
	return dbq.AttendanceRecord{}, nil
}

// ---- audit stub (Sprint 9) ----
//
// permission_matrix_test 가 HR/super_admin 으로 /api/hr/audit/attendance/list 를
// 호출할 때 200 + 빈 목록을 돌려주면 충분 (감사 도메인 동작은 audit 패키지 단위 테스트에서 검증).

func (f *fakeStore) SearchAttendanceAudit(ctx context.Context, arg dbq.SearchAttendanceAuditParams) ([]dbq.AttendanceRecord, error) {
	return []dbq.AttendanceRecord{}, nil
}

func (f *fakeStore) CountAttendanceAudit(ctx context.Context, arg dbq.CountAttendanceAuditParams) (int64, error) {
	return 0, nil
}

// ---- attendance stats stubs (Sprint 5) ----
//
// 통합 테스트는 stats 라우트 동작 자체는 검증하지 않고 라우터 등록/미들웨어 게이트만 확인.
// 안전 default (빈 결과) 만 반환.

func (f *fakeStore) ListAttendanceByUserRange(ctx context.Context, arg dbq.ListAttendanceByUserRangeParams) ([]dbq.AttendanceRecord, error) {
	return []dbq.AttendanceRecord{}, nil
}

func (f *fakeStore) ListAttendanceByTeamsRange(ctx context.Context, arg dbq.ListAttendanceByTeamsRangeParams) ([]dbq.AttendanceRecord, error) {
	return []dbq.AttendanceRecord{}, nil
}

func (f *fakeStore) ListAttendanceByTenantRange(ctx context.Context, arg dbq.ListAttendanceByTenantRangeParams) ([]dbq.AttendanceRecord, error) {
	return []dbq.AttendanceRecord{}, nil
}

func (f *fakeStore) ListUsersByTeams(ctx context.Context, arg dbq.ListUsersByTeamsParams) ([]dbq.User, error) {
	return []dbq.User{}, nil
}

func (f *fakeStore) ListTeamDescendants(ctx context.Context, arg dbq.ListTeamDescendantsParams) ([]int64, error) {
	return []int64{arg.RootTeamID}, nil
}

// ---- leave_requests stubs (Sprint 6) ----
//
// 통합 테스트는 leave-requests 라우트 자체 검증보다는 라우터/권한 게이트 동작에 집중.
// 안전 default — 모든 조회는 ErrNoRows, 변경 메서드는 빈 결과.

func (f *fakeStore) GetLeaveRequestByID(ctx context.Context, arg dbq.GetLeaveRequestByIDParams) (dbq.LeaveRequestApproval, error) {
	return dbq.LeaveRequestApproval{}, pgx.ErrNoRows
}

func (f *fakeStore) GetLeaveRequestForUpdate(ctx context.Context, arg dbq.GetLeaveRequestForUpdateParams) (dbq.LeaveRequestApproval, error) {
	return dbq.LeaveRequestApproval{}, pgx.ErrNoRows
}

func (f *fakeStore) CreateLeaveRequest(ctx context.Context, arg dbq.CreateLeaveRequestParams) (dbq.LeaveRequestApproval, error) {
	return dbq.LeaveRequestApproval{}, pgx.ErrNoRows
}

func (f *fakeStore) FindOverlappingLeaveRequests(ctx context.Context, arg dbq.FindOverlappingLeaveRequestsParams) ([]dbq.LeaveRequestApproval, error) {
	return nil, nil
}

func (f *fakeStore) CancelLeaveRequest(ctx context.Context, arg dbq.CancelLeaveRequestParams) (dbq.LeaveRequestApproval, error) {
	return dbq.LeaveRequestApproval{}, pgx.ErrNoRows
}

func (f *fakeStore) ListLeaveRequestsByRequester(ctx context.Context, arg dbq.ListLeaveRequestsByRequesterParams) ([]dbq.LeaveRequestApproval, error) {
	return nil, nil
}

func (f *fakeStore) CountLeaveRequestsByRequester(ctx context.Context, arg dbq.CountLeaveRequestsByRequesterParams) (int64, error) {
	return 0, nil
}

func (f *fakeStore) ListPendingLeaveRequestsByApprover(ctx context.Context, arg dbq.ListPendingLeaveRequestsByApproverParams) ([]dbq.LeaveRequestApproval, error) {
	return nil, nil
}

func (f *fakeStore) CountPendingLeaveRequestsByApprover(ctx context.Context, arg dbq.CountPendingLeaveRequestsByApproverParams) (int64, error) {
	return 0, nil
}

func (f *fakeStore) UpdateLeaveRequestDecision(ctx context.Context, arg dbq.UpdateLeaveRequestDecisionParams) (dbq.LeaveRequestApproval, error) {
	return dbq.LeaveRequestApproval{}, pgx.ErrNoRows
}

func (f *fakeStore) IncrementLeaveBalanceUsed(ctx context.Context, arg dbq.IncrementLeaveBalanceUsedParams) (dbq.LeaveBalance, error) {
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeStore) FetchApprovedLeaveDaysForUsers(ctx context.Context, arg dbq.FetchApprovedLeaveDaysForUsersParams) ([]dbq.FetchApprovedLeaveDaysForUsersRow, error) {
	return nil, nil
}

// ---- delegations stubs (Sprint 6) ----

func (f *fakeStore) CreateDelegation(ctx context.Context, arg dbq.CreateDelegationParams) (dbq.Delegation, error) {
	return dbq.Delegation{}, pgx.ErrNoRows
}

func (f *fakeStore) GetDelegationByID(ctx context.Context, arg dbq.GetDelegationByIDParams) (dbq.Delegation, error) {
	return dbq.Delegation{}, pgx.ErrNoRows
}

func (f *fakeStore) DeleteDelegation(ctx context.Context, arg dbq.DeleteDelegationParams) error {
	return nil
}

func (f *fakeStore) ListDelegationsByDelegator(ctx context.Context, arg dbq.ListDelegationsByDelegatorParams) ([]dbq.Delegation, error) {
	return nil, nil
}

func (f *fakeStore) ListActiveDelegationsByDelegator(ctx context.Context, arg dbq.ListActiveDelegationsByDelegatorParams) ([]dbq.Delegation, error) {
	return nil, nil
}

// ---- expensereport stubs (Sprint 7) — 통합 테스트는 expense API 를 호출하지 않으므로 noop. ----

func (f *fakeStore) CancelExpenseReport(_ context.Context, _ dbq.CancelExpenseReportParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, pgx.ErrNoRows
}
func (f *fakeStore) CountExpenseReportsByRequester(_ context.Context, _ dbq.CountExpenseReportsByRequesterParams) (int64, error) {
	return 0, nil
}
func (f *fakeStore) CountPendingExpenseReportsByApprover(_ context.Context, _ dbq.CountPendingExpenseReportsByApproverParams) (int64, error) {
	return 0, nil
}
func (f *fakeStore) CreateExpenseReport(_ context.Context, _ dbq.CreateExpenseReportParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, nil
}
func (f *fakeStore) GetExpenseReportByID(_ context.Context, _ dbq.GetExpenseReportByIDParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, pgx.ErrNoRows
}
func (f *fakeStore) GetExpenseReportForUpdate(_ context.Context, _ dbq.GetExpenseReportForUpdateParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, pgx.ErrNoRows
}
func (f *fakeStore) ListExpenseReportsByRequester(_ context.Context, _ dbq.ListExpenseReportsByRequesterParams) ([]dbq.ExpenseReportApproval, error) {
	return nil, nil
}
func (f *fakeStore) ListPendingExpenseReportsByApprover(_ context.Context, _ dbq.ListPendingExpenseReportsByApproverParams) ([]dbq.ExpenseReportApproval, error) {
	return nil, nil
}
func (f *fakeStore) UpdateExpenseReportAttachment(_ context.Context, _ dbq.UpdateExpenseReportAttachmentParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, nil
}
func (f *fakeStore) UpdateExpenseReportDecision(_ context.Context, _ dbq.UpdateExpenseReportDecisionParams) (dbq.ExpenseReportApproval, error) {
	return dbq.ExpenseReportApproval{}, nil
}

// ---- notification stubs (Sprint 8). ----

func (f *fakeStore) CreateNotification(_ context.Context, _ dbq.CreateNotificationParams) (dbq.Notification, error) {
	return dbq.Notification{}, nil
}
func (f *fakeStore) GetNotificationByID(_ context.Context, _ dbq.GetNotificationByIDParams) (dbq.Notification, error) {
	return dbq.Notification{}, pgx.ErrNoRows
}
func (f *fakeStore) ListNotificationsForUser(_ context.Context, _ dbq.ListNotificationsForUserParams) ([]dbq.Notification, error) {
	return nil, nil
}
func (f *fakeStore) CountNotificationsForUser(_ context.Context, _ dbq.CountNotificationsForUserParams) (int64, error) {
	return 0, nil
}
func (f *fakeStore) ListUnreadNotificationsForUser(_ context.Context, _ dbq.ListUnreadNotificationsForUserParams) ([]dbq.Notification, error) {
	return nil, nil
}
func (f *fakeStore) CountUnreadNotificationsForUser(_ context.Context, _ dbq.CountUnreadNotificationsForUserParams) (int64, error) {
	return 0, nil
}
func (f *fakeStore) MarkNotificationRead(_ context.Context, _ dbq.MarkNotificationReadParams) (dbq.Notification, error) {
	return dbq.Notification{}, pgx.ErrNoRows
}
func (f *fakeStore) MarkAllNotificationsRead(_ context.Context, _ dbq.MarkAllNotificationsReadParams) (int64, error) {
	return 0, nil
}

// ---- calendar stubs (Sprint 8). ----

func (f *fakeStore) ListCalendarLeaves(_ context.Context, _ dbq.ListCalendarLeavesParams) ([]dbq.ListCalendarLeavesRow, error) {
	return nil, nil
}
func (f *fakeStore) ListCalendarAttendances(_ context.Context, _ dbq.ListCalendarAttendancesParams) ([]dbq.ListCalendarAttendancesRow, error) {
	return nil, nil
}

var _ server.DomainStore = (*fakeStore)(nil)

// ---- 통합 테스트 ----

const intSecret = "integration-secret"

func newIntegrationEngine(t *testing.T) (*fakeStore, *gin.Engine) {
	t.Helper()
	store := newFakeStore()
	eng, err := server.NewEngine(server.Config{
		TenantID:  1,
		Store:     store,
		JWTIssuer: auth.NewTokenIssuer(intSecret),
	})
	if err != nil {
		t.Fatal(err)
	}
	return store, eng
}

func newIntegrationEngineWithPool(t *testing.T) (*fakeStore, *gin.Engine) {
	t.Helper()
	store := newFakeStore()
	eng, err := server.NewEngine(server.Config{
		TenantID:  1,
		Store:     store,
		JWTIssuer: auth.NewTokenIssuer(intSecret),
		Pool:      &pgxpool.Pool{},
	})
	if err != nil {
		t.Fatal(err)
	}
	return store, eng
}

type loginResp struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	UserID       int64  `json:"userId"`
	Role         string `json:"role"`
}

func registerAndLogin(t *testing.T, eng *gin.Engine, email, pw string) loginResp {
	t.Helper()
	postJSON(t, eng, "/api/auth/register", "", map[string]any{
		"email": email, "password": pw, "name": "U",
	})
	w, raw := postJSON(t, eng, "/api/auth/login", "", map[string]any{
		"email": email, "password": pw,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("login status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[loginResp]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	return *env.Data
}

func postJSON(t *testing.T, eng *gin.Engine, path, bearer string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

func getJSON(t *testing.T, eng *gin.Engine, path, bearer string) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

func TestIntegration_AuthRegisterLoginMe(t *testing.T) {
	store, eng := newIntegrationEngine(t)
	_ = store
	pair := registerAndLogin(t, eng, "u@example.com", "Pass1234")

	w, raw := getJSON(t, eng, "/api/users/me", pair.AccessToken)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestIntegration_UsersListRequiresHR(t *testing.T) {
	_, eng := newIntegrationEngine(t)
	pair := registerAndLogin(t, eng, "u@example.com", "Pass1234")

	// general 토큰으로 /api/users/list 호출 → 403.
	w, raw := postJSON(t, eng, "/api/users/list", pair.AccessToken, map[string]any{})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Forbidden {
		t.Fatalf("env=%+v", env)
	}
}

func TestIntegration_UsersListAsHR(t *testing.T) {
	store, eng := newIntegrationEngine(t)
	// 가입 후 HR 로 승격.
	registerAndLogin(t, eng, "hr@example.com", "Pass1234")
	for id, u := range store.users {
		u.Role = dbq.UserRoleHrManager
		u.TokenVersion++ // 기존 토큰 무효화 후 재로그인.
		store.users[id] = u
	}
	w, raw := postJSON(t, eng, "/api/auth/login", "", map[string]any{
		"email": "hr@example.com", "password": "Pass1234",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[loginResp]
	_ = json.Unmarshal(raw, &env)

	w, raw = postJSON(t, eng, "/api/users/list", env.Data.AccessToken, map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestIntegration_TeamsCRUD_HROnly(t *testing.T) {
	_, eng := newIntegrationEngine(t)
	pair := registerAndLogin(t, eng, "u@example.com", "Pass1234")

	// general 이 팀 생성 시도 → 403.
	w, _ := postJSON(t, eng, "/api/teams", pair.AccessToken, map[string]any{"name": "T1"})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d", w.Code)
	}

	// general 도 list/get 은 가능.
	w, _ = postJSON(t, eng, "/api/teams/list", pair.AccessToken, map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestIntegration_DomainRoutes_WithPoolRegistered(t *testing.T) {
	_, eng := newIntegrationEngineWithPool(t)
	pair := registerAndLogin(t, eng, "u@example.com", "Pass1234")

	cases := []struct {
		name string
		path string
		want int
	}{
		{name: "leave me list", path: "/api/hr/leave-requests/me/list", want: http.StatusOK},
		{name: "expense me list", path: "/api/hr/expense-reports/me/list", want: http.StatusOK},
		{name: "leave pending requires team lead", path: "/api/hr/leave-requests/pending/list", want: http.StatusForbidden},
		{name: "expense pending requires team lead", path: "/api/hr/expense-reports/pending/list", want: http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, raw := postJSON(t, eng, tc.path, pair.AccessToken, map[string]any{})
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d body=%s", w.Code, tc.want, raw)
			}
		})
	}
}

func TestIntegration_AttendanceStatsMe_EnrichesActorTeamContext(t *testing.T) {
	store, eng := newIntegrationEngine(t)
	pair := registerAndLogin(t, eng, "u@example.com", "Pass1234")
	for id, u := range store.users {
		u.TeamID = pgtype.Int8{Int64: 77, Valid: true}
		store.users[id] = u
	}

	w, raw := postJSON(t, eng, "/api/hr/attendance/me/stats", pair.AccessToken, map[string]any{
		"period": "day",
		"date":   "2026-05-25",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestIntegration_RegisterDuplicate_400(t *testing.T) {
	_, eng := newIntegrationEngine(t)
	body := map[string]any{"email": "dup@example.com", "password": "Pass1234", "name": "D"}
	postJSON(t, eng, "/api/auth/register", "", body)
	w, raw := postJSON(t, eng, "/api/auth/register", "", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.EmailDuplicate {
		t.Fatalf("env=%+v", env)
	}
}
