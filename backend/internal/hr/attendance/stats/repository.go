package stats

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
)

// SQLCQuerier — sqlc 가 생성한 Queries 의 부분 집합.
// dbq.Queries 가 그대로 만족하므로 server 부트스트랩 시 *dbq.Queries 를 넘기면 된다.
type SQLCQuerier interface {
	ListAttendanceByUserRange(ctx context.Context, arg dbq.ListAttendanceByUserRangeParams) ([]dbq.AttendanceRecord, error)
	ListAttendanceByTeamsRange(ctx context.Context, arg dbq.ListAttendanceByTeamsRangeParams) ([]dbq.AttendanceRecord, error)
	ListAttendanceByTenantRange(ctx context.Context, arg dbq.ListAttendanceByTenantRangeParams) ([]dbq.AttendanceRecord, error)
	ListUsersByTeams(ctx context.Context, arg dbq.ListUsersByTeamsParams) ([]dbq.User, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	ListHolidaysInRange(ctx context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error)
	ListTeamDescendants(ctx context.Context, arg dbq.ListTeamDescendantsParams) ([]int64, error)
}

// SQLAttendanceStore — Scoped Querier 패턴의 attendance 구현.
//
// Service 가 호출하는 [AttendanceStore.ListAttendanceForRange] 는 scope 분기를
// SQL 호출 메서드 분기로 변환한다. 동적 SQL build 를 피하기 위해 미리 정의된
// 3개의 named query 중 하나를 선택.
//
//   - All=true            → ListAttendanceByTenantRange
//   - UserID != nil       → ListAttendanceByUserRange
//   - len(TeamIDs) > 0    → ListAttendanceByTeamsRange (team_ids = ANY)
//   - 모두 비어있음        → 빈 결과 반환 (안전 default — 권한 의심 시 차단).
type SQLAttendanceStore struct {
	q SQLCQuerier
}

// NewSQLAttendanceStore — sqlc Querier 주입.
func NewSQLAttendanceStore(q SQLCQuerier) *SQLAttendanceStore {
	return &SQLAttendanceStore{q: q}
}

// ListAttendanceForRange — scope 에 따라 분기.
func (s *SQLAttendanceStore) ListAttendanceForRange(ctx context.Context, sc scope.Scope, from, to time.Time) ([]dbq.AttendanceRecord, error) {
	fromArg := pgtype.Date{Time: from, Valid: true}
	toArg := pgtype.Date{Time: to, Valid: true}

	switch {
	case sc.All:
		return s.q.ListAttendanceByTenantRange(ctx, dbq.ListAttendanceByTenantRangeParams{
			TenantID: sc.TenantID,
			FromDate: fromArg,
			ToDate:   toArg,
		})
	case sc.UserID != nil:
		return s.q.ListAttendanceByUserRange(ctx, dbq.ListAttendanceByUserRangeParams{
			TenantID: sc.TenantID,
			UserID:   *sc.UserID,
			FromDate: fromArg,
			ToDate:   toArg,
		})
	case len(sc.TeamIDs) > 0:
		return s.q.ListAttendanceByTeamsRange(ctx, dbq.ListAttendanceByTeamsRangeParams{
			TenantID: sc.TenantID,
			TeamIds:  sc.TeamIDs,
			FromDate: fromArg,
			ToDate:   toArg,
		})
	default:
		// 안전 default: scope 가 비어 있으면 빈 결과 (권한 누수 방지).
		return nil, nil
	}
}

// SQLUserStore — UserStore 의 sqlc 어댑터.
type SQLUserStore struct {
	q SQLCQuerier
}

// NewSQLUserStore — sqlc Querier 주입.
func NewSQLUserStore(q SQLCQuerier) *SQLUserStore {
	return &SQLUserStore{q: q}
}

// GetUserByID — dbq.GetUserByIDParams 그대로 위임.
func (s *SQLUserStore) GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	return s.q.GetUserByID(ctx, arg)
}

// ListUsersByTeams — dbq.ListUsersByTeams 호출.
func (s *SQLUserStore) ListUsersByTeams(ctx context.Context, tenantID int64, teamIDs []int64) ([]dbq.User, error) {
	if len(teamIDs) == 0 {
		return nil, nil
	}
	return s.q.ListUsersByTeams(ctx, dbq.ListUsersByTeamsParams{
		TenantID: tenantID,
		TeamIds:  teamIDs,
	})
}
