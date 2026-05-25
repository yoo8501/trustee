package notification_test

import (
	"context"
	"errors"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/notification"
)

const (
	tenantID = int64(1)
	userA    = int64(10)
	userB    = int64(20)
)

func newSvc(f *fakeStore) *notification.Service {
	return notification.NewService(f)
}

// ---------- Notify (Notifier interface) ----------

func TestService_Notify_PersistsRow(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	err := svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{
		Type:       "leave_request_submitted",
		Title:      "휴가 결재 요청",
		Body:       "홍길동 님이 휴가를 신청했습니다.",
		RelatedURL: "/approvals/1",
	})
	if err != nil {
		t.Fatalf("notify err=%v", err)
	}

	got, err := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})
	if err != nil {
		t.Fatalf("list err=%v", err)
	}
	if got.Total != 1 || len(got.Items) != 1 {
		t.Fatalf("total=%d items=%d want 1/1", got.Total, len(got.Items))
	}
	if got.Items[0].Type != "leave_request_submitted" {
		t.Errorf("type=%s", got.Items[0].Type)
	}
	if got.Items[0].RelatedURL != "/approvals/1" {
		t.Errorf("related_url=%s", got.Items[0].RelatedURL)
	}
	if got.Items[0].ReadAt != nil {
		t.Errorf("read_at=%v want nil (unread)", got.Items[0].ReadAt)
	}
}

func TestService_Notify_EmptyTitle_Rejected(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	err := svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{
		Type:  "x",
		Title: "",
		Body:  "y",
	})
	if !errors.Is(err, notification.ErrInvalidPayload) {
		t.Fatalf("err=%v want ErrInvalidPayload", err)
	}
}

func TestService_Notify_ZeroUserID_Rejected(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	err := svc.Notify(context.Background(), tenantID, 0, notification.NewNotification{
		Type:  "x",
		Title: "t",
		Body:  "y",
	})
	if !errors.Is(err, notification.ErrInvalidPayload) {
		t.Fatalf("err=%v want ErrInvalidPayload", err)
	}
}

// ---------- List ----------

func TestService_List_OnlyOwn(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "a-1", Body: "b"})
	_ = svc.Notify(context.Background(), tenantID, userB, notification.NewNotification{Type: "x", Title: "b-1", Body: "b"})

	got, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})
	if got.Total != 1 || len(got.Items) != 1 {
		t.Fatalf("user A should only see own — total=%d items=%d", got.Total, len(got.Items))
	}
	if got.Items[0].Title != "a-1" {
		t.Errorf("title=%s", got.Items[0].Title)
	}
}

func TestService_List_UnreadOnly_FiltersReadRows(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "n1", Body: "b"})
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "n2", Body: "b"})

	// 첫 알림 읽음 처리.
	full, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})
	_, err := svc.Read(context.Background(), tenantID, userA, full.Items[len(full.Items)-1].ID) // 가장 오래된 1번
	if err != nil {
		t.Fatalf("read err=%v", err)
	}

	got, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10, UnreadOnly: true})
	if got.Total != 1 {
		t.Fatalf("unread total=%d want 1", got.Total)
	}
	if got.Items[0].Title != "n2" {
		t.Errorf("unread item title=%s want n2", got.Items[0].Title)
	}
}

// ---------- Read ----------

func TestService_Read_Idempotent(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t", Body: "b"})

	full, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})
	id := full.Items[0].ID

	v1, err := svc.Read(context.Background(), tenantID, userA, id)
	if err != nil || v1.ReadAt == nil {
		t.Fatalf("first read err=%v read_at=%v", err, v1.ReadAt)
	}
	// 두 번째 호출 — 같은 read_at 유지 (멱등).
	v2, err := svc.Read(context.Background(), tenantID, userA, id)
	if err != nil || v2.ReadAt == nil {
		t.Fatalf("second read err=%v", err)
	}
	if !v1.ReadAt.Equal(*v2.ReadAt) {
		t.Errorf("read_at not idempotent: %v vs %v", v1.ReadAt, v2.ReadAt)
	}
}

func TestService_Read_NotOwner_NotFound(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t", Body: "b"})
	full, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})

	// userB 가 userA 의 알림을 읽으려 시도 → NotFound.
	_, err := svc.Read(context.Background(), tenantID, userB, full.Items[0].ID)
	if !errors.Is(err, notification.ErrNotFound) {
		t.Fatalf("err=%v want ErrNotFound", err)
	}
}

func TestService_Read_Missing_NotFound(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_, err := svc.Read(context.Background(), tenantID, userA, 999)
	if !errors.Is(err, notification.ErrNotFound) {
		t.Fatalf("err=%v want ErrNotFound", err)
	}
}

// ---------- ReadAll ----------

func TestService_ReadAll_MarksAllUnreadOfUser(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "n1", Body: "b"})
	_ = svc.Notify(context.Background(), tenantID, userA, notification.NewNotification{Type: "x", Title: "n2", Body: "b"})
	_ = svc.Notify(context.Background(), tenantID, userB, notification.NewNotification{Type: "x", Title: "b-1", Body: "b"})

	n, err := svc.ReadAll(context.Background(), tenantID, userA)
	if err != nil {
		t.Fatalf("readall err=%v", err)
	}
	if n != 2 {
		t.Errorf("affected=%d want 2", n)
	}

	got, _ := svc.List(context.Background(), tenantID, userA, notification.ListInput{Page: 1, Size: 10, UnreadOnly: true})
	if got.Total != 0 {
		t.Errorf("after readall unread total=%d want 0", got.Total)
	}
	// userB 알림은 영향 없음.
	gotB, _ := svc.List(context.Background(), tenantID, userB, notification.ListInput{Page: 1, Size: 10, UnreadOnly: true})
	if gotB.Total != 1 {
		t.Errorf("userB unread total=%d want 1 (not affected)", gotB.Total)
	}
}
