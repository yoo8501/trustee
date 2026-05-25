// Package audit — HR / super_admin 의 출퇴근 감사 로그 조회 service.
//
// Sprint 9: attendance_records 테이블 위에서 SELECT only (Sprint 4 attendance domain 의
// CheckIn/CheckOut 흐름과 분리).
//
// 본 service 는 (1) HR 가 임직원 출퇴근 이력을 조회하고, (2) client_ip / user_agent /
// source 같은 감사 메타데이터를 노출하여 의심 행위 (예: 다른 IP 에서 출근, 수동 정정 이력)
// 를 추적할 수 있게 한다.
//
// 권한은 라우터의 RequireRole(hr_manager, super_admin) 미들웨어가 강제 — 본 service 는
// 호출이 이미 인가된 것으로 가정한다.
package audit

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Store — audit service 의 DB 의존성 (sqlc Querier 부분 집합).
type Store interface {
	SearchAttendanceAudit(ctx context.Context, arg dbq.SearchAttendanceAuditParams) ([]dbq.AttendanceRecord, error)
	CountAttendanceAudit(ctx context.Context, arg dbq.CountAttendanceAuditParams) (int64, error)
}

var _ Store = (*dbq.Queries)(nil)

// Service — audit 도메인 service.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// SearchInput — 출퇴근 감사 검색 입력. 모든 필터는 optional.
type SearchInput struct {
	TenantID int64
	UserID   *int64     // nil → 전체.
	From     *time.Time // 시작일 (inclusive). nil → 제한 없음.
	To       *time.Time // 종료일 (inclusive). nil → 제한 없음.
	Source   *string    // 'button' | 'manual_correction'. nil → 전체.
	ClientIP *string    // 정확 일치 (CIDR 미지원). nil → 전체.
	Page     int32      // 1-based. 0 이하 → 1.
	Size     int32      // 0 이하 → 20, 100 초과 → 100.
}

// AttendanceAuditView — service / handler 가 주고받는 정규화된 표현.
// pgtype 의존을 handler 에서 분리.
type AttendanceAuditView struct {
	ID                int64
	UserID            int64
	WorkDate          time.Time
	CheckInAt         *time.Time
	CheckOutAt        *time.Time
	LunchBreakMinutes int32
	Source            string
	ClientIP          string
	UserAgent         string
	Status            string
	CreatedAt         time.Time
}

func toView(r dbq.AttendanceRecord) AttendanceAuditView {
	v := AttendanceAuditView{
		ID:                r.ID,
		UserID:            r.UserID,
		LunchBreakMinutes: r.LunchBreakMinutes,
		Source:            string(r.Source),
		Status:            string(r.Status),
	}
	if r.WorkDate.Valid {
		v.WorkDate = r.WorkDate.Time
	}
	if r.CheckInAt.Valid {
		t := r.CheckInAt.Time
		v.CheckInAt = &t
	}
	if r.CheckOutAt.Valid {
		t := r.CheckOutAt.Time
		v.CheckOutAt = &t
	}
	if r.ClientIp != nil {
		v.ClientIP = r.ClientIp.String()
	}
	if r.UserAgent.Valid {
		v.UserAgent = r.UserAgent.String
	}
	if r.CreatedAt.Valid {
		v.CreatedAt = r.CreatedAt.Time
	}
	return v
}

// SearchResult — 검색 결과.
type SearchResult struct {
	Items []AttendanceAuditView
	Total int64
}

// Search — attendance_records 검색. 모든 필터는 optional, 결과는 pagination.
//
// 결과 ORDER BY: work_date DESC, user_id ASC, id ASC (SQL 과 일치).
func (s *Service) Search(ctx context.Context, in SearchInput) (SearchResult, error) {
	page := in.Page
	if page < 1 {
		page = 1
	}
	size := in.Size
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	offset := (page - 1) * size

	userIDArg := pgtype.Int8{}
	if in.UserID != nil {
		userIDArg = pgtype.Int8{Int64: *in.UserID, Valid: true}
	}
	fromArg := pgtype.Date{}
	if in.From != nil {
		fromArg = pgtype.Date{Time: *in.From, Valid: true}
	}
	toArg := pgtype.Date{}
	if in.To != nil {
		toArg = pgtype.Date{Time: *in.To, Valid: true}
	}
	sourceArg := pgtype.Text{}
	if in.Source != nil && *in.Source != "" {
		sourceArg = pgtype.Text{String: *in.Source, Valid: true}
	}
	ipArg := pgtype.Text{}
	if in.ClientIP != nil && *in.ClientIP != "" {
		ipArg = pgtype.Text{String: *in.ClientIP, Valid: true}
	}

	rows, err := s.store.SearchAttendanceAudit(ctx, dbq.SearchAttendanceAuditParams{
		TenantID: in.TenantID,
		UserID:   userIDArg,
		FromDate: fromArg,
		ToDate:   toArg,
		Source:   sourceArg,
		ClientIp: ipArg,
		Off:      offset,
		Lim:      size,
	})
	if err != nil {
		return SearchResult{}, err
	}
	total, err := s.store.CountAttendanceAudit(ctx, dbq.CountAttendanceAuditParams{
		TenantID: in.TenantID,
		UserID:   userIDArg,
		FromDate: fromArg,
		ToDate:   toArg,
		Source:   sourceArg,
		ClientIp: ipArg,
	})
	if err != nil {
		return SearchResult{}, err
	}

	items := make([]AttendanceAuditView, 0, len(rows))
	for _, r := range rows {
		items = append(items, toView(r))
	}
	return SearchResult{Items: items, Total: total}, nil
}
