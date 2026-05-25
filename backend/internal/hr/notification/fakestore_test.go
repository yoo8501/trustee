package notification_test

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeStore — notification.Store in-memory 구현.
type fakeStore struct {
	mu      sync.Mutex
	items   map[int64]dbq.Notification
	nextID  int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{items: map[int64]dbq.Notification{}}
}

func (f *fakeStore) CreateNotification(_ context.Context, arg dbq.CreateNotificationParams) (dbq.Notification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	n := dbq.Notification{
		ID:         f.nextID,
		TenantID:   arg.TenantID,
		UserID:     arg.UserID,
		Type:       arg.Type,
		Title:      arg.Title,
		Body:       arg.Body,
		RelatedUrl: arg.RelatedUrl,
		CreatedAt:  pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.items[n.ID] = n
	return n, nil
}

func (f *fakeStore) GetNotificationByID(_ context.Context, arg dbq.GetNotificationByIDParams) (dbq.Notification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.items[arg.ID]
	if !ok || n.TenantID != arg.TenantID {
		return dbq.Notification{}, pgx.ErrNoRows
	}
	return n, nil
}

func (f *fakeStore) ListNotificationsForUser(_ context.Context, arg dbq.ListNotificationsForUserParams) ([]dbq.Notification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var rows []dbq.Notification
	for _, n := range f.items {
		if n.UserID == arg.UserID && n.TenantID == arg.TenantID {
			rows = append(rows, n)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		// 최신순.
		ti := rows[i].CreatedAt.Time
		tj := rows[j].CreatedAt.Time
		if ti.Equal(tj) {
			return rows[i].ID > rows[j].ID
		}
		return ti.After(tj)
	})
	start := int(arg.Offset)
	if start > len(rows) {
		start = len(rows)
	}
	end := start + int(arg.Limit)
	if end > len(rows) {
		end = len(rows)
	}
	return rows[start:end], nil
}

func (f *fakeStore) CountNotificationsForUser(_ context.Context, arg dbq.CountNotificationsForUserParams) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	for _, it := range f.items {
		if it.UserID == arg.UserID && it.TenantID == arg.TenantID {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) ListUnreadNotificationsForUser(_ context.Context, arg dbq.ListUnreadNotificationsForUserParams) ([]dbq.Notification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var rows []dbq.Notification
	for _, n := range f.items {
		if n.UserID == arg.UserID && n.TenantID == arg.TenantID && !n.ReadAt.Valid {
			rows = append(rows, n)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		ti := rows[i].CreatedAt.Time
		tj := rows[j].CreatedAt.Time
		if ti.Equal(tj) {
			return rows[i].ID > rows[j].ID
		}
		return ti.After(tj)
	})
	start := int(arg.Offset)
	if start > len(rows) {
		start = len(rows)
	}
	end := start + int(arg.Limit)
	if end > len(rows) {
		end = len(rows)
	}
	return rows[start:end], nil
}

func (f *fakeStore) CountUnreadNotificationsForUser(_ context.Context, arg dbq.CountUnreadNotificationsForUserParams) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	for _, it := range f.items {
		if it.UserID == arg.UserID && it.TenantID == arg.TenantID && !it.ReadAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) MarkNotificationRead(_ context.Context, arg dbq.MarkNotificationReadParams) (dbq.Notification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.items[arg.ID]
	if !ok || n.TenantID != arg.TenantID || n.UserID != arg.UserID {
		return dbq.Notification{}, pgx.ErrNoRows
	}
	if !n.ReadAt.Valid {
		n.ReadAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
		f.items[n.ID] = n
	}
	return n, nil
}

func (f *fakeStore) MarkAllNotificationsRead(_ context.Context, arg dbq.MarkAllNotificationsReadParams) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	for id, it := range f.items {
		if it.UserID == arg.UserID && it.TenantID == arg.TenantID && !it.ReadAt.Valid {
			it.ReadAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
			f.items[id] = it
			n++
		}
	}
	return n, nil
}
