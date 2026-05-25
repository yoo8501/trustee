package permission_test

import (
	"testing"

	"github.com/sjseo/docflow/backend/internal/permission"
)

func TestRank(t *testing.T) {
	cases := []struct {
		role permission.Role
		want int
	}{
		{permission.RoleGeneral, 0},
		{permission.RoleTeamLead, 1},
		{permission.RoleDeptHead, 2},
		{permission.RoleHRManager, 3},
		{permission.RoleSuperAdmin, 4},
		{permission.Role("unknown"), -1},
	}
	for _, c := range cases {
		if got := permission.Rank(c.role); got != c.want {
			t.Fatalf("Rank(%q) = %d, want %d", c.role, got, c.want)
		}
	}
}

func TestAtLeast(t *testing.T) {
	if !permission.AtLeast(permission.RoleSuperAdmin, permission.RoleHRManager) {
		t.Fatalf("super_admin must be at least hr_manager")
	}
	if !permission.AtLeast(permission.RoleHRManager, permission.RoleHRManager) {
		t.Fatalf("self must be at least self")
	}
	if permission.AtLeast(permission.RoleTeamLead, permission.RoleHRManager) {
		t.Fatalf("team_lead must NOT be at least hr_manager")
	}
	if permission.AtLeast(permission.Role("unknown"), permission.RoleGeneral) {
		t.Fatalf("unknown role must not pass AtLeast")
	}
}

func TestIsHRManagerOrAbove(t *testing.T) {
	cases := []struct {
		role permission.Role
		want bool
	}{
		{permission.RoleGeneral, false},
		{permission.RoleTeamLead, false},
		{permission.RoleDeptHead, false},
		{permission.RoleHRManager, true},
		{permission.RoleSuperAdmin, true},
	}
	for _, c := range cases {
		if got := permission.IsHRManagerOrAbove(c.role); got != c.want {
			t.Fatalf("IsHRManagerOrAbove(%q) = %v, want %v", c.role, got, c.want)
		}
	}
}

func TestIsSuperAdmin(t *testing.T) {
	if !permission.IsSuperAdmin(permission.RoleSuperAdmin) {
		t.Fatal("super_admin must be super_admin")
	}
	if permission.IsSuperAdmin(permission.RoleHRManager) {
		t.Fatal("hr_manager is not super_admin")
	}
}

func TestIsValid(t *testing.T) {
	if !permission.IsValid(permission.RoleGeneral) {
		t.Fatal("general must be valid")
	}
	if permission.IsValid(permission.Role("hacker")) {
		t.Fatal("hacker must not be valid")
	}
}

func TestIn(t *testing.T) {
	if !permission.In(permission.RoleHRManager, permission.RoleHRManager, permission.RoleSuperAdmin) {
		t.Fatal("hr_manager must be in candidates")
	}
	if permission.In(permission.RoleGeneral, permission.RoleHRManager, permission.RoleSuperAdmin) {
		t.Fatal("general must NOT be in candidates")
	}
}
