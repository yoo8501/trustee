package server_test

import (
	"encoding/json"
	"net/http"
	"testing"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// TestPermissionMatrix — 라우터에 부착된 권한 미들웨어가 role 별로 올바르게 분기하는지
// 매트릭스 형태로 검증한다. Sprint 9 DoD 의 "permission matrix 15+ 케이스".
//
// 각 케이스는 다음을 검증:
//   1) registerAs 로 사용자를 가입 + role 승격 (필요 시)
//   2) 라우트 호출 → expectStatus 일치
//   3) 4xx 의 경우 expectErrorCode 일치 (errorcode.* 상수)
//
// 도메인 동작 자체는 각 패키지 단위 테스트에서 검증되며,
// 본 테스트는 "권한 게이트가 정확히 닫혀 있는가" 만 확인.
func TestPermissionMatrix(t *testing.T) {
	type matrixCase struct {
		name            string
		role            dbq.UserRole // 가입 후 직접 승격할 role
		method          string
		path            string
		body            map[string]any
		expectStatus    int
		expectErrorCode string // "" 이면 검증 skip (성공 케이스).
	}

	cases := []matrixCase{
		// ---- general (가입 시 기본 role) ----
		{
			name: "general → /api/users/list 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/users/list", body: map[string]any{},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/users/update 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/users/update", body: map[string]any{"id": 2, "name": "x"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/users/terminate 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/users/terminate", body: map[string]any{"userId": 2},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/teams 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/teams", body: map[string]any{"name": "T1"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/teams/update 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/teams/update", body: map[string]any{"id": 1, "name": "T1"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/teams/delete 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/teams/delete", body: map[string]any{"id": 1},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/hr/audit/attendance/list 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/hr/audit/attendance/list", body: map[string]any{},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "general → /api/hr/leave-balances/1/adjust 403", role: dbq.UserRoleGeneral,
			method: http.MethodPost, path: "/api/hr/leave-balances/1/adjust",
			body:         map[string]any{"leaveTypeId": 1, "deltaHours": 8, "reason": "x"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},

		// ---- team_lead (super_admin 전용 라우트만 막힘) ----
		{
			name: "team_lead → /api/users/update 403", role: dbq.UserRoleTeamLead,
			method: http.MethodPost, path: "/api/users/update", body: map[string]any{"id": 2, "name": "x"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "team_lead → /api/users/terminate 403", role: dbq.UserRoleTeamLead,
			method: http.MethodPost, path: "/api/users/terminate", body: map[string]any{"userId": 2},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},

		// ---- hr_manager (super_admin 전용은 막힘, HR+ 라우트는 통과) ----
		{
			name: "hr_manager → /api/users/update 403", role: dbq.UserRoleHrManager,
			method: http.MethodPost, path: "/api/users/update", body: map[string]any{"id": 2, "name": "x"},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "hr_manager → /api/users/terminate 403", role: dbq.UserRoleHrManager,
			method: http.MethodPost, path: "/api/users/terminate", body: map[string]any{"userId": 2},
			expectStatus: http.StatusForbidden, expectErrorCode: errorcode.Forbidden,
		},
		{
			name: "hr_manager → /api/users/list 200", role: dbq.UserRoleHrManager,
			method: http.MethodPost, path: "/api/users/list", body: map[string]any{},
			expectStatus: http.StatusOK,
		},
		{
			name: "hr_manager → /api/hr/audit/attendance/list 200", role: dbq.UserRoleHrManager,
			method: http.MethodPost, path: "/api/hr/audit/attendance/list", body: map[string]any{},
			expectStatus: http.StatusOK,
		},
		{
			name: "hr_manager → /api/teams (create) 200", role: dbq.UserRoleHrManager,
			method: http.MethodPost, path: "/api/teams", body: map[string]any{"name": "TeamHR"},
			expectStatus: http.StatusOK,
		},

		// ---- super_admin (모든 라우트 통과) ----
		{
			name: "super_admin → /api/users/list 200", role: dbq.UserRoleSuperAdmin,
			method: http.MethodPost, path: "/api/users/list", body: map[string]any{},
			expectStatus: http.StatusOK,
		},
		{
			name: "super_admin → /api/users/update 200 (target 본인 아님)", role: dbq.UserRoleSuperAdmin,
			method: http.MethodPost, path: "/api/users/update",
			body: map[string]any{"id": 999, "name": "x"}, // 존재하지 않는 user → 404 도 권한은 통과한 결과.
			expectStatus: http.StatusNotFound,             // 미들웨어는 통과, service 가 404.
			expectErrorCode: errorcode.NotFound,
		},
		{
			name: "super_admin → /api/hr/audit/attendance/list 200", role: dbq.UserRoleSuperAdmin,
			method: http.MethodPost, path: "/api/hr/audit/attendance/list", body: map[string]any{},
			expectStatus: http.StatusOK,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			store, eng := newIntegrationEngine(t)
			// 매 케이스 신규 계정 + role 승격 (token_version 강제 증가 후 재로그인).
			email := "matrix@example.com"
			registerAndLogin(t, eng, email, "Pass1234")
			for id, u := range store.users {
				u.Role = c.role
				u.TokenVersion++
				store.users[id] = u
			}
			w, raw := postJSON(t, eng, "/api/auth/login", "", map[string]any{
				"email": email, "password": "Pass1234",
			})
			if w.Code != http.StatusOK {
				t.Fatalf("login failed: %d body=%s", w.Code, raw)
			}
			var loginEnv apiresult.Envelope[loginResp]
			_ = json.Unmarshal(raw, &loginEnv)
			token := loginEnv.Data.AccessToken

			w, raw = postJSON(t, eng, c.path, token, c.body)
			if w.Code != c.expectStatus {
				t.Fatalf("status = %d, want %d body=%s", w.Code, c.expectStatus, raw)
			}
			if c.expectErrorCode != "" {
				var env apiresult.Envelope[any]
				if err := json.Unmarshal(raw, &env); err != nil {
					t.Fatalf("unmarshal: %v body=%s", err, raw)
				}
				if env.Details == nil {
					t.Fatalf("details missing for %d body=%s", w.Code, raw)
				}
				if env.Details.ErrorCode != c.expectErrorCode {
					t.Fatalf("errorCode = %q, want %q", env.Details.ErrorCode, c.expectErrorCode)
				}
			}
		})
	}
}
