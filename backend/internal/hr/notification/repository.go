// Package notification — 인앱 알림 도메인 (Sprint 8).
//
// plan.md §데이터 모델 Notification — 결재 상신/승인/반려/자동마감 등 이벤트가
// 본 도메인의 Notify (Notifier 인터페이스) 를 통해 row 를 적재하고, 사용자의
// 헤더 종 / 사이드바 배지가 List / ReadAll API 로 미읽음을 조회한다.
//
// 외부 도메인 (leaverequest / expensereport / cron) 은 [Notifier] 인터페이스에
// 의존하고, 본 패키지의 *Service 가 그 구현체를 제공한다. 이렇게 분리해서
// (1) 도메인은 notification 패키지를 직접 import 하지 않고 (test 시 fake notifier 주입 용이),
// (2) 알림 적재 실패가 호출 도메인의 비즈니스 로직 (예: 결재 승인) 을 깨지 않게 한다.
package notification

import (
	"context"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Store — Service 가 사용하는 DB 의존성. dbq.Queries 가 그대로 만족.
type Store interface {
	CreateNotification(ctx context.Context, arg dbq.CreateNotificationParams) (dbq.Notification, error)
	GetNotificationByID(ctx context.Context, arg dbq.GetNotificationByIDParams) (dbq.Notification, error)
	ListNotificationsForUser(ctx context.Context, arg dbq.ListNotificationsForUserParams) ([]dbq.Notification, error)
	CountNotificationsForUser(ctx context.Context, arg dbq.CountNotificationsForUserParams) (int64, error)
	ListUnreadNotificationsForUser(ctx context.Context, arg dbq.ListUnreadNotificationsForUserParams) ([]dbq.Notification, error)
	CountUnreadNotificationsForUser(ctx context.Context, arg dbq.CountUnreadNotificationsForUserParams) (int64, error)
	MarkNotificationRead(ctx context.Context, arg dbq.MarkNotificationReadParams) (dbq.Notification, error)
	MarkAllNotificationsRead(ctx context.Context, arg dbq.MarkAllNotificationsReadParams) (int64, error)
}

// compile-time check.
var _ Store = (*dbq.Queries)(nil)
