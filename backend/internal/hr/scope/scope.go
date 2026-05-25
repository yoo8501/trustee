// Package scope — Repository-layer Scoped Querier 의 권한 결정 로직.
//
// plan.md §아키텍처 결정 — Scoped Querier:
// "모든 attendance/leave 쿼리에 tenant_id + scope 자동 적용".
//
// 본 패키지는 (1) 요청자 역할 + 요청한 scope 를 입력으로 받아 (2) Repository 가 그대로
// 사용할 수 있는 [Scope] struct (tenant_id, user_id, team_ids, all 플래그) 를 만든다.
// 권한 위반은 [ErrForbidden] 으로 반환 → 핸들러가 403 으로 매핑.
//
// 권한 매트릭스 ([../../docs/01-plan/features/hr-platform.plan.md] §권한 매트릭스):
//
//   - general    : me-only
//   - team_lead  : me, team (자기 팀)
//   - dept_head  : me, team/dept (자기 산하 팀 전체)
//   - hr_manager : me, team (전사), all
//   - super_admin: me, team (전사), all
//
// 위임자(Delegation)는 직교축 — Sprint 6 이후 별도 wrap.
package scope

import (
	"context"
	"errors"

	"github.com/sjseo/docflow/backend/internal/permission"
)

// ErrForbidden — 요청한 scope 에 대한 권한이 없을 때 반환.
// 핸들러는 [errors.Is](err, ErrForbidden) 로 분기하여 403 + errorcode.Forbidden 응답.
var ErrForbidden = errors.New("scope: forbidden")

// Actor — 요청자 식별 정보. JWT 미들웨어가 채워서 핸들러가 전달.
type Actor struct {
	ID       int64
	TenantID int64
	Role     permission.Role
	TeamID   int64 // 0 이면 팀 미지정 (HR/super_admin 흔함).
}

// Request — 요청한 scope. Scope=""/"me" 는 본인, "team"/"dept" 는 팀, "all" 은 전사.
//
//	TeamID nil → "team" 일 때 본인 소속 팀으로 기본 (team_lead/dept_head 일반 케이스).
//	TeamID 지정 → 권한 검증 (자기 팀 또는 산하 팀만 허용).
type Request struct {
	Scope  string
	TeamID *int64
}

// Scope — Repository 가 WHERE 절 구성에 사용하는 결과.
//
//	TenantID         : 항상 채움 (모든 쿼리에 tenant_id WHERE 강제, CLAUDE.md §3.6).
//	UserID  != nil   : me-scope — user_id = *UserID 필터.
//	TeamIDs 비어있지 않음 : user_id IN (subquery: users WHERE team_id = ANY(TeamIDs)) 필터.
//	All     == true  : tenant 전체 (HR / super_admin).
type Scope struct {
	TenantID int64
	UserID   *int64
	TeamIDs  []int64
	All      bool
}

// TeamHierarchy — dept_head 의 산하 팀 (자기 자신 포함) 을 풀어주는 어댑터.
// teams.Service 가 구현하거나, 캐시된 trie 를 주입한다.
type TeamHierarchy interface {
	// DescendantsOf — teamID 자신 + 모든 직/간접 하위 팀 ID.
	// 에러 발생 시 빈 slice + err 반환. teamID 미존재 시 (nil, nil) 또는 ([teamID], nil).
	DescendantsOf(ctx context.Context, tenantID, teamID int64) ([]int64, error)
}

// Resolve — actor + req → Scope. 권한 위반 시 ErrForbidden.
//
// 정책:
//
//   - general                 : me 만 허용. team/all → Forbidden.
//   - team_lead               : me 와 team 만 허용. team 요청 시 TeamID 가 nil 또는 본인 팀이어야 함.
//   - dept_head               : me 와 team/dept 만 허용. TeamID 가 nil 이면 산하 전체, 지정되면 산하에 포함되어야 함.
//   - hr_manager / super_admin: me / team (전사) / all 모두 허용.
//   - 알 수 없는 role/scope    : Forbidden.
func Resolve(ctx context.Context, a Actor, req Request, hier TeamHierarchy) (Scope, error) {
	scopeName := req.Scope
	if scopeName == "" {
		scopeName = "me"
	}

	switch scopeName {
	case "me", "team", "dept", "all":
		// ok
	default:
		return Scope{}, ErrForbidden
	}

	if !permission.IsValid(a.Role) {
		return Scope{}, ErrForbidden
	}

	switch a.Role {
	case permission.RoleGeneral:
		if scopeName != "me" {
			return Scope{}, ErrForbidden
		}
		uid := a.ID
		return Scope{TenantID: a.TenantID, UserID: &uid}, nil

	case permission.RoleTeamLead:
		switch scopeName {
		case "me":
			uid := a.ID
			return Scope{TenantID: a.TenantID, UserID: &uid}, nil
		case "team":
			target := a.TeamID
			if req.TeamID != nil {
				if *req.TeamID != a.TeamID {
					return Scope{}, ErrForbidden
				}
				target = *req.TeamID
			}
			return Scope{TenantID: a.TenantID, TeamIDs: []int64{target}}, nil
		default:
			return Scope{}, ErrForbidden
		}

	case permission.RoleDeptHead:
		switch scopeName {
		case "me":
			uid := a.ID
			return Scope{TenantID: a.TenantID, UserID: &uid}, nil
		case "team", "dept":
			descendants, err := hier.DescendantsOf(ctx, a.TenantID, a.TeamID)
			if err != nil {
				return Scope{}, err
			}
			if len(descendants) == 0 {
				descendants = []int64{a.TeamID}
			}
			if req.TeamID != nil {
				if !contains(descendants, *req.TeamID) {
					return Scope{}, ErrForbidden
				}
				return Scope{TenantID: a.TenantID, TeamIDs: []int64{*req.TeamID}}, nil
			}
			return Scope{TenantID: a.TenantID, TeamIDs: descendants}, nil
		default:
			return Scope{}, ErrForbidden
		}

	case permission.RoleHRManager, permission.RoleSuperAdmin:
		switch scopeName {
		case "me":
			uid := a.ID
			return Scope{TenantID: a.TenantID, UserID: &uid}, nil
		case "team", "dept":
			if req.TeamID == nil {
				// HR/super_admin 본인 팀이 없으면 전사 (all) 로 간주.
				if a.TeamID == 0 {
					return Scope{TenantID: a.TenantID, All: true}, nil
				}
				return Scope{TenantID: a.TenantID, TeamIDs: []int64{a.TeamID}}, nil
			}
			return Scope{TenantID: a.TenantID, TeamIDs: []int64{*req.TeamID}}, nil
		case "all":
			return Scope{TenantID: a.TenantID, All: true}, nil
		}
	}

	return Scope{}, ErrForbidden
}

func contains(xs []int64, v int64) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
