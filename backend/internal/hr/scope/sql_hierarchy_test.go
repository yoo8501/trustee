package scope_test

import (
	"context"
	"errors"
	"testing"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
)

// fakeQuerier — HierarchyQuerier 메모리 구현.
type fakeQuerier struct {
	rows map[int64][]int64 // root_team_id → descendants.
	err  error
}

func (f fakeQuerier) ListTeamDescendants(_ context.Context, arg dbq.ListTeamDescendantsParams) ([]int64, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.rows[arg.RootTeamID], nil
}

// teamID == 0 → 빈 결과 (DB hit 없음).
func TestSQLHierarchy_ZeroTeamID_NoQuery(t *testing.T) {
	h := scope.NewSQLHierarchy(fakeQuerier{})
	got, err := h.DescendantsOf(context.Background(), 1, 0)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(got) != 0 {
		t.Errorf("len=%d want 0", len(got))
	}
}

// 정상 호출 → querier 결과 전달.
func TestSQLHierarchy_Descendants_Returned(t *testing.T) {
	h := scope.NewSQLHierarchy(fakeQuerier{rows: map[int64][]int64{
		100: {100, 101, 102},
	}})
	got, err := h.DescendantsOf(context.Background(), 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Errorf("len=%d want 3", len(got))
	}
}

// 에러 전파.
func TestSQLHierarchy_Error_Propagates(t *testing.T) {
	h := scope.NewSQLHierarchy(fakeQuerier{err: errors.New("db down")})
	_, err := h.DescendantsOf(context.Background(), 1, 100)
	if err == nil {
		t.Fatal("err nil want db down")
	}
}
