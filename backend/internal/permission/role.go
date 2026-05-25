// Package permission — role enum + 권한 헬퍼.
//
// plan.md §권한 매트릭스 5단계:
//
//	general < team_lead < dept_head < hr_manager < super_admin
//
// 위임자(Delegation)는 직교축으로 Sprint 6 에서 별도 도입한다.
package permission

// Role — 5단계 역할 enum. DB 의 user_role enum 과 1:1 대응.
type Role string

const (
	RoleGeneral    Role = "general"
	RoleTeamLead   Role = "team_lead"
	RoleDeptHead   Role = "dept_head"
	RoleHRManager  Role = "hr_manager"
	RoleSuperAdmin Role = "super_admin"
)

// roleRank — 비교용 ordinal. 높을수록 강한 권한.
var roleRank = map[Role]int{
	RoleGeneral:    0,
	RoleTeamLead:   1,
	RoleDeptHead:   2,
	RoleHRManager:  3,
	RoleSuperAdmin: 4,
}

// Rank 는 role 의 순위를 반환. 알 수 없는 role 은 -1.
func Rank(r Role) int {
	if v, ok := roleRank[r]; ok {
		return v
	}
	return -1
}

// AtLeast 는 r 이 min 이상의 권한인지 확인.
func AtLeast(r, min Role) bool {
	rr := Rank(r)
	mn := Rank(min)
	if rr < 0 || mn < 0 {
		return false
	}
	return rr >= mn
}

// IsHRManagerOrAbove 는 HR 이상의 관리자 권한 여부. (HR / super_admin)
func IsHRManagerOrAbove(r Role) bool {
	return AtLeast(r, RoleHRManager)
}

// IsSuperAdmin — super_admin 여부.
func IsSuperAdmin(r Role) bool {
	return r == RoleSuperAdmin
}

// IsValid 는 정의된 role 인지 확인. 입력 검증용.
func IsValid(r Role) bool {
	_, ok := roleRank[r]
	return ok
}

// In 은 r 이 candidates 중 하나인지 확인. RequireRole 미들웨어에서 사용.
func In(r Role, candidates ...Role) bool {
	for _, c := range candidates {
		if r == c {
			return true
		}
	}
	return false
}
