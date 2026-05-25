// Package holiday — 공휴일 / 회사 휴일 조회 service.
//
// 본 sprint 에서는 read-only. 시드 SQL 로 데이터 주입 (000006_seed_holidays_2026_kr.up.sql).
// CRUD UI 는 Sprint 9 admin 에서 다룬다.
package holiday

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors.
var (
	ErrHolidayNotFound = errors.New("holiday: not found")
)

// Store — holiday service 의 DB 의존성.
type Store interface {
	GetHolidayByID(ctx context.Context, arg dbq.GetHolidayByIDParams) (dbq.Holiday, error)
	ListHolidays(ctx context.Context, tenantID int64) ([]dbq.Holiday, error)
	ListHolidaysInRange(ctx context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error)
	CountHolidays(ctx context.Context, tenantID int64) (int64, error)
}

var _ Store = (*dbq.Queries)(nil)

// Service — 공휴일 read-only.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// View — 도메인 표현.
type View struct {
	ID          int64
	Date        time.Time
	Name        string
	IsRecurring bool
	CountryCode string
}

func toView(h dbq.Holiday) View {
	v := View{
		ID:          h.ID,
		Name:        h.Name,
		IsRecurring: h.IsRecurring,
		CountryCode: h.CountryCode,
	}
	if h.Date.Valid {
		v.Date = h.Date.Time
	}
	return v
}

// ListInput — 목록 필터.
type ListInput struct {
	From *time.Time
	To   *time.Time
}

// List — 공휴일 목록. From/To 가 모두 있으면 범위 조회, 아니면 전체.
func (s *Service) List(ctx context.Context, tenantID int64, in ListInput) ([]View, error) {
	var (
		rows []dbq.Holiday
		err  error
	)
	if in.From != nil && in.To != nil {
		rows, err = s.store.ListHolidaysInRange(ctx, dbq.ListHolidaysInRangeParams{
			TenantID: tenantID,
			Date:     pgtype.Date{Time: *in.From, Valid: true},
			Date_2:   pgtype.Date{Time: *in.To, Valid: true},
		})
	} else {
		rows, err = s.store.ListHolidays(ctx, tenantID)
	}
	if err != nil {
		return nil, err
	}
	out := make([]View, 0, len(rows))
	for _, h := range rows {
		out = append(out, toView(h))
	}
	return out, nil
}

// Get — 단건 조회.
func (s *Service) Get(ctx context.Context, id, tenantID int64) (View, error) {
	h, err := s.store.GetHolidayByID(ctx, dbq.GetHolidayByIDParams{ID: id, TenantID: tenantID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrHolidayNotFound
		}
		return View{}, err
	}
	return toView(h), nil
}
