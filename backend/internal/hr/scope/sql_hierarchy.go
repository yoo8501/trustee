package scope

import (
	"context"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// HierarchyQuerier — sqlc 가 생성한 ListTeamDescendants 쿼리. dbq.Queries 가 만족.
type HierarchyQuerier interface {
	ListTeamDescendants(ctx context.Context, arg dbq.ListTeamDescendantsParams) ([]int64, error)
}

// SQLHierarchy — TeamHierarchy 의 sqlc 어댑터. 재귀 CTE 기반.
type SQLHierarchy struct {
	q HierarchyQuerier
}

// NewSQLHierarchy — sqlc Querier 주입.
func NewSQLHierarchy(q HierarchyQuerier) *SQLHierarchy {
	return &SQLHierarchy{q: q}
}

// DescendantsOf — root_team_id 자신 + 모든 직/간접 하위 팀. teamID==0 → 빈 결과.
func (s *SQLHierarchy) DescendantsOf(ctx context.Context, tenantID, teamID int64) ([]int64, error) {
	if teamID == 0 {
		return nil, nil
	}
	return s.q.ListTeamDescendants(ctx, dbq.ListTeamDescendantsParams{
		RootTeamID: teamID,
		TenantID:   tenantID,
	})
}
