package notification

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors.
var (
	// ErrInvalidPayload — Notify 호출 시 필수 필드 누락 (userID, type, title, body).
	ErrInvalidPayload = errors.New("notification: invalid payload")
	// ErrNotFound — 조회/읽음 처리 대상 row 가 없거나 본인 소유가 아님.
	ErrNotFound = errors.New("notification: not found")
)

// NewNotification — 외부 도메인이 Notifier.Notify 로 전달하는 payload.
//
// Type 은 자유 문자열 (DB enum 아님). plan.md §데이터 모델 Notification 에
// 사용되는 값의 카탈로그 정리. 신규 type 추가 시 frontend i18n 매핑 함께 갱신.
type NewNotification struct {
	Type       string
	Title      string
	Body       string
	RelatedURL string // optional — 클릭 시 이동 경로 (예: "/approvals/123")
}

// Notifier — 외부 도메인이 의존하는 알림 트리거 인터페이스.
//
// Notify 는 절대로 호출 도메인의 비즈니스 로직을 깨면 안 된다 — 실패 시 nil 반환
// + slog 로 로그. 호출자가 err != nil 체크 후 무시해도 안전하도록 함.
// (현 구현은 에러를 반환하지만, 호출 site 에서 무시한다.)
type Notifier interface {
	Notify(ctx context.Context, tenantID, userID int64, n NewNotification) error
}

// Service — notification 도메인 service. Notifier 구현 + List/Read/ReadAll API.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// View — service / handler 도메인 표현 (pgtype 정규화).
type View struct {
	ID         int64
	UserID     int64
	Type       string
	Title      string
	Body       string
	RelatedURL string
	ReadAt     *time.Time
	CreatedAt  time.Time
}

func toView(r dbq.Notification) View {
	v := View{
		ID:     r.ID,
		UserID: r.UserID,
		Type:   r.Type,
		Title:  r.Title,
		Body:   r.Body,
	}
	if r.RelatedUrl.Valid {
		v.RelatedURL = r.RelatedUrl.String
	}
	if r.ReadAt.Valid {
		t := r.ReadAt.Time
		v.ReadAt = &t
	}
	if r.CreatedAt.Valid {
		v.CreatedAt = r.CreatedAt.Time
	}
	return v
}

// ---------- Notify (Notifier impl) ----------

// Notify — userID 에게 알림 row 적재.
//
// 검증:
//   - userID > 0, type/title/body 모두 비어있지 않음 → 아니면 ErrInvalidPayload.
//
// tenantID 는 호출자가 명시 (auth context 에서 추출한 값을 그대로 전달). 0 이면 1 로 보정.
func (s *Service) Notify(ctx context.Context, tenantID, userID int64, n NewNotification) error {
	if userID <= 0 {
		return ErrInvalidPayload
	}
	if strings.TrimSpace(n.Type) == "" || strings.TrimSpace(n.Title) == "" || strings.TrimSpace(n.Body) == "" {
		return ErrInvalidPayload
	}
	if tenantID == 0 {
		tenantID = 1
	}
	relatedURL := pgtype.Text{}
	if strings.TrimSpace(n.RelatedURL) != "" {
		relatedURL = pgtype.Text{String: n.RelatedURL, Valid: true}
	}
	_, err := s.store.CreateNotification(ctx, dbq.CreateNotificationParams{
		TenantID:   tenantID,
		UserID:     userID,
		Type:       n.Type,
		Title:      n.Title,
		Body:       n.Body,
		RelatedUrl: relatedURL,
	})
	return err
}

// ---------- List ----------

// ListInput — List 입력 파라미터.
type ListInput struct {
	Page       int32
	Size       int32
	UnreadOnly bool
}

// ListResult — List 결과 + total.
type ListResult struct {
	Items []View
	Total int64
}

// List — 본인 알림 목록.
//
//   - UnreadOnly=true → read_at IS NULL 만 + total = 미읽음 카운트.
//   - 그 외 → 전체 + total = 전체 카운트.
func (s *Service) List(ctx context.Context, tenantID, userID int64, in ListInput) (ListResult, error) {
	page, size := normalizePagination(in.Page, in.Size)
	offset := (page - 1) * size

	if in.UnreadOnly {
		rows, err := s.store.ListUnreadNotificationsForUser(ctx, dbq.ListUnreadNotificationsForUserParams{
			UserID: userID, TenantID: tenantID, Limit: size, Offset: offset,
		})
		if err != nil {
			return ListResult{}, err
		}
		total, err := s.store.CountUnreadNotificationsForUser(ctx, dbq.CountUnreadNotificationsForUserParams{
			UserID: userID, TenantID: tenantID,
		})
		if err != nil {
			return ListResult{}, err
		}
		out := make([]View, 0, len(rows))
		for _, r := range rows {
			out = append(out, toView(r))
		}
		return ListResult{Items: out, Total: total}, nil
	}

	rows, err := s.store.ListNotificationsForUser(ctx, dbq.ListNotificationsForUserParams{
		UserID: userID, TenantID: tenantID, Limit: size, Offset: offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountNotificationsForUser(ctx, dbq.CountNotificationsForUserParams{
		UserID: userID, TenantID: tenantID,
	})
	if err != nil {
		return ListResult{}, err
	}
	out := make([]View, 0, len(rows))
	for _, r := range rows {
		out = append(out, toView(r))
	}
	return ListResult{Items: out, Total: total}, nil
}

// ---------- Read ----------

// Read — 본인 알림 하나를 읽음 처리. 이미 읽은 row 는 read_at 유지 (멱등).
//
//   - userID 와 row.user_id 가 다르면 ErrNotFound.
//   - row 미존재면 ErrNotFound.
func (s *Service) Read(ctx context.Context, tenantID, userID, id int64) (View, error) {
	r, err := s.store.MarkNotificationRead(ctx, dbq.MarkNotificationReadParams{
		ID: id, TenantID: tenantID, UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	return toView(r), nil
}

// ---------- ReadAll ----------

// ReadAll — 본인의 모든 미읽음 알림을 읽음 처리. affected row count 반환.
func (s *Service) ReadAll(ctx context.Context, tenantID, userID int64) (int64, error) {
	return s.store.MarkAllNotificationsRead(ctx, dbq.MarkAllNotificationsReadParams{
		UserID: userID, TenantID: tenantID,
	})
}

// ---------- helpers ----------

func normalizePagination(page, size int32) (int32, int32) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 50
	}
	return page, size
}
