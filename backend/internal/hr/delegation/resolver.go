// Package delegation — 결재 위임 도메인 (Sprint 6).
//
// plan.md §데이터 모델 Delegation:
//
//	delegator_id 가 자기 결재 권한을 delegate_id 에게 valid_from ~ valid_to 동안 위임한다.
//	scope JSONB 가 "document_types" 키로 제한되거나 빈 {} 면 모든 문서.
//
// 본 패키지는 (1) Resolver — approver_id 결정 시점에 활성 위임을 매칭하여 라우팅,
// (2) CRUD service — 본인이 자기 위임 등록/조회/삭제, 두 가지를 다룬다.
package delegation

import (
	"context"
	"encoding/json"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// DocumentTypeLeaveRequest — leave_request 문서 타입 식별자.
// scope.document_types 매칭에 사용.
const DocumentTypeLeaveRequest = "leave_request"

// ResolverStore — Resolver 의 DB 의존성. dbq.Queries 가 만족.
type ResolverStore interface {
	ListActiveDelegationsByDelegator(ctx context.Context, arg dbq.ListActiveDelegationsByDelegatorParams) ([]dbq.Delegation, error)
}

// Resolver — approver_id 결정 시점에 활성 위임 매칭.
//
// 사용 흐름:
//  1. LeaveRequest Service 가 baseApprover (manager_id 또는 team.team_lead_id) 를 계산
//  2. Resolver.Resolve(ctx, baseApprover, time.Now()) 호출
//  3. 매칭 위임이 있으면 delegate_id 반환, 없으면 baseApprover 그대로 반환
//
// scope 매칭 규칙:
//   - scope JSON 이 빈 {} 또는 document_types 누락 → 모든 문서 적용 (전체 위임)
//   - scope.document_types 배열에 docType 포함 → 적용
//   - 그 외 → 미적용 (다음 위임 후보로)
type Resolver struct {
	store    ResolverStore
	tenantID int64
}

// NewResolver — store 와 default tenant id 주입.
func NewResolver(store ResolverStore, tenantID int64) *Resolver {
	if tenantID == 0 {
		tenantID = 1
	}
	return &Resolver{store: store, tenantID: tenantID}
}

// Resolve — baseApprover 기준 활성 위임이 있으면 delegate_id 반환.
//
//   - baseApprover == 0 → 0 그대로 (위임 매칭 불가).
//   - DB 오류 → baseApprover 그대로 + nil (graceful degrade. 위임 매칭 실패가 결재 자체를
//     막아서는 안 됨; 호출자는 별도 로그를 남긴다).
//   - 활성 위임이 없거나 scope 미매칭 → baseApprover.
//
// docType 이 "" 이면 매칭 기준은 빈 scope 만 (안전 default).
func (r *Resolver) Resolve(ctx context.Context, baseApprover int64, at time.Time, docType string) int64 {
	if baseApprover == 0 {
		return 0
	}
	active, err := r.store.ListActiveDelegationsByDelegator(ctx, dbq.ListActiveDelegationsByDelegatorParams{
		DelegatorID: baseApprover,
		TenantID:    r.tenantID,
		ValidFrom:   pgTimestamptz(at),
	})
	if err != nil || len(active) == 0 {
		return baseApprover
	}
	for _, d := range active {
		if scopeMatches(d.Scope, docType) {
			return d.DelegateID
		}
	}
	return baseApprover
}

// IsDelegate — actorID 가 originalApprover 의 활성 위임자 여부를 검증.
//
// Approve/Reject 핸들러가 사용 — 결재자 검증 시 본인이거나 활성 위임자면 통과.
// DB 오류 시 false (안전 default — 권한 누수 방지).
func (r *Resolver) IsDelegate(ctx context.Context, originalApprover, actorID int64, at time.Time, docType string) bool {
	if originalApprover == 0 || actorID == 0 {
		return false
	}
	if originalApprover == actorID {
		return true
	}
	active, err := r.store.ListActiveDelegationsByDelegator(ctx, dbq.ListActiveDelegationsByDelegatorParams{
		DelegatorID: originalApprover,
		TenantID:    r.tenantID,
		ValidFrom:   pgTimestamptz(at),
	})
	if err != nil {
		return false
	}
	for _, d := range active {
		if d.DelegateID == actorID && scopeMatches(d.Scope, docType) {
			return true
		}
	}
	return false
}

// scopeMatches — scope JSON 이 docType 을 허용하는지 확인.
//
//   - 빈 / 잘못된 / document_types 누락 → true (전체 위임).
//   - document_types 배열에 docType 포함 → true.
//   - 그 외 → false.
//
// docType == "" 이면 빈 scope 만 매칭 (안전 default — 호출자가 명시적으로 비워둔 케이스).
func scopeMatches(raw []byte, docType string) bool {
	if len(raw) == 0 {
		return true
	}
	var parsed struct {
		DocumentTypes []string `json:"document_types"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return true
	}
	if len(parsed.DocumentTypes) == 0 {
		return true
	}
	if docType == "" {
		return false
	}
	for _, t := range parsed.DocumentTypes {
		if t == docType {
			return true
		}
	}
	return false
}
