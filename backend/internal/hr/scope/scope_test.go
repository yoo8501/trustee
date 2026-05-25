package scope_test

import (
	"errors"
	"sort"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// fakeHierarchy — TeamHierarchy 메모리 구현.
type fakeHierarchy struct {
	descendants map[int64][]int64 // 부모 → 자기 자신 + 모든 자손.
}

func (f fakeHierarchy) DescendantsOf(teamID int64) []int64 {
	if v, ok := f.descendants[teamID]; ok {
		return v
	}
	return []int64{teamID}
}

func actor(id int64, role permission.Role, teamID int64) scope.Actor {
	return scope.Actor{ID: id, TenantID: 1, Role: role, TeamID: teamID}
}

// general → 항상 me-only.
func TestResolve_General_AlwaysMe(t *testing.T) {
	a := actor(7, permission.RoleGeneral, 10)
	for _, req := range []string{"", "me", "team", "all"} {
		t.Run(req, func(t *testing.T) {
			sc, err := scope.Resolve(a, scope.Request{Scope: req}, fakeHierarchy{})
			if req == "team" || req == "all" {
				if !errors.Is(err, scope.ErrForbidden) {
					t.Fatalf("err=%v want ErrForbidden", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("err=%v", err)
			}
			if sc.UserID == nil || *sc.UserID != 7 {
				t.Errorf("UserID=%v want &7", sc.UserID)
			}
			if sc.TenantID != 1 {
				t.Errorf("TenantID=%d want 1", sc.TenantID)
			}
			if sc.All {
				t.Error("All=true unexpected for general")
			}
			if len(sc.TeamIDs) != 0 {
				t.Errorf("TeamIDs=%v want empty", sc.TeamIDs)
			}
		})
	}
}

// team_lead + scope=team → 자기 팀 1개.
func TestResolve_TeamLead_TeamScope_OwnTeamOnly(t *testing.T) {
	a := actor(7, permission.RoleTeamLead, 10)
	sc, err := scope.Resolve(a, scope.Request{Scope: "team"}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if !equalInt64Slice(sc.TeamIDs, []int64{10}) {
		t.Errorf("TeamIDs=%v want [10]", sc.TeamIDs)
	}
	if sc.UserID != nil {
		t.Error("UserID should be nil for team scope")
	}
}

// team_lead + scope=team + 다른 팀 요청 → ErrForbidden.
func TestResolve_TeamLead_RequestOtherTeam_Forbidden(t *testing.T) {
	a := actor(7, permission.RoleTeamLead, 10)
	other := int64(20)
	_, err := scope.Resolve(a, scope.Request{Scope: "team", TeamID: &other}, fakeHierarchy{})
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// team_lead + scope=all → ErrForbidden.
func TestResolve_TeamLead_AllScope_Forbidden(t *testing.T) {
	a := actor(7, permission.RoleTeamLead, 10)
	_, err := scope.Resolve(a, scope.Request{Scope: "all"}, fakeHierarchy{})
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// team_lead + scope=me → me only.
func TestResolve_TeamLead_MeScope(t *testing.T) {
	a := actor(7, permission.RoleTeamLead, 10)
	sc, err := scope.Resolve(a, scope.Request{Scope: "me"}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if sc.UserID == nil || *sc.UserID != 7 {
		t.Errorf("UserID=%v want &7", sc.UserID)
	}
}

// dept_head + scope=team → 산하 모든 팀.
func TestResolve_DeptHead_TeamScope_DescendantsAll(t *testing.T) {
	hier := fakeHierarchy{descendants: map[int64][]int64{
		100: {100, 101, 102, 103},
	}}
	a := actor(7, permission.RoleDeptHead, 100)
	sc, err := scope.Resolve(a, scope.Request{Scope: "team"}, hier)
	if err != nil {
		t.Fatal(err)
	}
	want := []int64{100, 101, 102, 103}
	if !equalInt64Slice(sc.TeamIDs, want) {
		t.Errorf("TeamIDs=%v want %v", sc.TeamIDs, want)
	}
}

// dept_head — 자기 산하 팀 ID 직접 요청은 허용.
func TestResolve_DeptHead_RequestDescendantTeam_OK(t *testing.T) {
	hier := fakeHierarchy{descendants: map[int64][]int64{
		100: {100, 101, 102},
	}}
	a := actor(7, permission.RoleDeptHead, 100)
	target := int64(101)
	sc, err := scope.Resolve(a, scope.Request{Scope: "team", TeamID: &target}, hier)
	if err != nil {
		t.Fatal(err)
	}
	if !equalInt64Slice(sc.TeamIDs, []int64{101}) {
		t.Errorf("TeamIDs=%v want [101]", sc.TeamIDs)
	}
}

// dept_head — 산하 아닌 팀 요청 → Forbidden.
func TestResolve_DeptHead_RequestOutsideTeam_Forbidden(t *testing.T) {
	hier := fakeHierarchy{descendants: map[int64][]int64{
		100: {100, 101},
	}}
	a := actor(7, permission.RoleDeptHead, 100)
	target := int64(200)
	_, err := scope.Resolve(a, scope.Request{Scope: "team", TeamID: &target}, hier)
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// dept_head + scope=all → Forbidden.
func TestResolve_DeptHead_AllScope_Forbidden(t *testing.T) {
	a := actor(7, permission.RoleDeptHead, 100)
	_, err := scope.Resolve(a, scope.Request{Scope: "all"}, fakeHierarchy{})
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// hr_manager + scope=all → All=true.
func TestResolve_HRManager_AllScope(t *testing.T) {
	a := actor(7, permission.RoleHRManager, 0)
	sc, err := scope.Resolve(a, scope.Request{Scope: "all"}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if !sc.All {
		t.Error("All=false want true for hr_manager all")
	}
}

// hr_manager + scope=team + 임의 팀 → 허용 (전사 권한).
func TestResolve_HRManager_AnyTeam(t *testing.T) {
	a := actor(7, permission.RoleHRManager, 0)
	target := int64(99)
	sc, err := scope.Resolve(a, scope.Request{Scope: "team", TeamID: &target}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if !equalInt64Slice(sc.TeamIDs, []int64{99}) {
		t.Errorf("TeamIDs=%v want [99]", sc.TeamIDs)
	}
}

// hr_manager + scope=me → me only.
func TestResolve_HRManager_MeScope(t *testing.T) {
	a := actor(7, permission.RoleHRManager, 0)
	sc, err := scope.Resolve(a, scope.Request{Scope: "me"}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if sc.UserID == nil || *sc.UserID != 7 {
		t.Errorf("UserID=%v want &7", sc.UserID)
	}
}

// super_admin + scope=all.
func TestResolve_SuperAdmin_AllScope(t *testing.T) {
	a := actor(7, permission.RoleSuperAdmin, 0)
	sc, err := scope.Resolve(a, scope.Request{Scope: "all"}, fakeHierarchy{})
	if err != nil {
		t.Fatal(err)
	}
	if !sc.All {
		t.Error("All=false want true")
	}
}

// 알 수 없는 role → Forbidden.
func TestResolve_UnknownRole_Forbidden(t *testing.T) {
	a := scope.Actor{ID: 1, TenantID: 1, Role: permission.Role("ghost"), TeamID: 0}
	_, err := scope.Resolve(a, scope.Request{Scope: "all"}, fakeHierarchy{})
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// 알 수 없는 scope → Forbidden.
func TestResolve_UnknownScope_Forbidden(t *testing.T) {
	a := actor(7, permission.RoleGeneral, 10)
	_, err := scope.Resolve(a, scope.Request{Scope: "world"}, fakeHierarchy{})
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

func equalInt64Slice(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	ac := append([]int64(nil), a...)
	bc := append([]int64(nil), b...)
	sort.Slice(ac, func(i, j int) bool { return ac[i] < ac[j] })
	sort.Slice(bc, func(i, j int) bool { return bc[i] < bc[j] })
	for i := range ac {
		if ac[i] != bc[i] {
			return false
		}
	}
	return true
}
