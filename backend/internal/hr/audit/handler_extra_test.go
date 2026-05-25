package audit_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/audit"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// 형식 오류 from / to → 400 + VALIDATION_FAILED.

func TestHandler_AttendanceList_InvalidFromDate_ValidationFailed(t *testing.T) {
	store := newFakeAuditStore()
	eng := newAuditEng(store, 100, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"from": "20260501", // 잘못된 형식.
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_AttendanceList_InvalidToDate_ValidationFailed(t *testing.T) {
	store := newFakeAuditStore()
	eng := newAuditEng(store, 100, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"to": "not-a-date",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

// store 가 에러 반환 시 500 + INTERNAL_ERROR.

type errStore struct{}

func (e errStore) SearchAttendanceAudit(_ context.Context, _ dbq.SearchAttendanceAuditParams) ([]dbq.AttendanceRecord, error) {
	return nil, errors.New("db boom")
}

func (e errStore) CountAttendanceAudit(_ context.Context, _ dbq.CountAttendanceAuditParams) (int64, error) {
	return 0, errors.New("db boom")
}

func TestHandler_AttendanceList_StoreError_Internal(t *testing.T) {
	eng := newAuditEng(errStore{}, 100, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InternalError {
		t.Fatalf("env=%+v", env)
	}
}

// Count fail 만 — Search 는 성공, Count 만 실패.

type countOnlyFailStore struct {
	*fakeAuditStore
}

func (c countOnlyFailStore) CountAttendanceAudit(_ context.Context, _ dbq.CountAttendanceAuditParams) (int64, error) {
	return 0, errors.New("count boom")
}

func TestService_Search_CountError(t *testing.T) {
	store := countOnlyFailStore{fakeAuditStore: newFakeAuditStore()}
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-01")})
	svc := audit.NewService(store)

	_, err := svc.Search(context.Background(), audit.SearchInput{TenantID: 1})
	if err == nil {
		t.Fatal("expected error from failing CountAttendanceAudit")
	}
}
