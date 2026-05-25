// verify-calendar — 모든 active user 의 calendar 응답에 DB 의 모든 holiday +
// approved/pending LeaveRequest 가 포함되는지 비교.
//
// 사용:
//
//	DATABASE_URL=postgres://... go run ./scripts/verify-calendar --days=90
//
// 검증:
//
//	모든 user 에 대해 calendar.Service.List(scope="all", from, to) 호출 →
//	응답에 DB 의 모든 (holiday, leave) row 가 존재해야 함.
//	누락 1건이라도 발견 시 exit 1.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/config"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/calendar"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// ErrCalendarMissing — 캘린더 응답에 expected row 가 누락된 경우.
var ErrCalendarMissing = errors.New("verify-calendar: missing events found")

func main() {
	var (
		days   = flag.Int("days", 90, "오늘 기준 ±N/2 일 (캘린더 MaxDateRange 90일 한도)")
		nowStr = flag.String("now", "", "YYYY-MM-DD 기준 (기본: 오늘 KST)")
	)
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	var nowKST time.Time
	if *nowStr == "" {
		nowKST = time.Now().In(leave.KSTLocation())
	} else {
		d, err := time.ParseInLocation("2006-01-02", *nowStr, leave.KSTLocation())
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid --now: %v\n", err)
			os.Exit(1)
		}
		nowKST = d
	}
	// 90일 한도 안전 (calendar.MaxDateRange).
	if *days > 90 {
		*days = 90
	}
	from := time.Date(nowKST.Year(), nowKST.Month(), nowKST.Day(), 0, 0, 0, 0, nowKST.Location()).
		AddDate(0, 0, -*days/2)
	to := from.AddDate(0, 0, *days)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db pool: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "db ping: %v\n", err)
		os.Exit(1)
	}
	q := dbq.New(pool)

	logger.Info("verify-calendar starting",
		slog.Int("days", *days),
		slog.Time("from", from),
		slog.Time("to", to),
		slog.Int64("tenant_id", cfg.TenantID))

	// 1) DB 에서 expected event 추출.
	holidayRows, err := q.ListHolidaysInRange(ctx, dbq.ListHolidaysInRangeParams{
		TenantID: cfg.TenantID,
		Date:     pgtype.Date{Time: from, Valid: true},
		Date_2:   pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "list holidays: %v\n", err)
		os.Exit(1)
	}
	leaveRows, err := q.ListCalendarLeaves(ctx, dbq.ListCalendarLeavesParams{
		TenantID: cfg.TenantID,
		FromAt:   pgtype.Timestamptz{Time: from, Valid: true},
		ToAt:     pgtype.Timestamptz{Time: to.Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "list leaves: %v\n", err)
		os.Exit(1)
	}
	expected := make([]ExpectedEvent, 0, len(holidayRows)+len(leaveRows))
	for _, h := range holidayRows {
		ev := ExpectedEvent{Kind: "holiday", ID: h.ID, Label: h.Name}
		if h.Date.Valid {
			ev.Date = h.Date.Time
		}
		expected = append(expected, ev)
	}
	for _, l := range leaveRows {
		ev := ExpectedEvent{Kind: "leave", ID: l.ID, Label: l.RequesterName}
		if l.StartAt.Valid {
			ev.Date = l.StartAt.Time
		}
		expected = append(expected, ev)
	}

	// 2) 각 active user 의 calendar API 호출 → observed event 추출.
	users, err := q.ListActiveUsersForAccrual(ctx, cfg.TenantID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "list users: %v\n", err)
		os.Exit(1)
	}

	svc := calendar.NewService(q)
	results := make([]UserCheckResult, 0, len(users))
	for _, u := range users {
		resp, err := svc.List(ctx, calendar.ListInput{
			TenantID: cfg.TenantID,
			ActorID:  u.ID,
			Role:     permission.Role(u.Role),
			From:     from,
			To:       to,
			Scope:    calendar.ScopeAll, // 전사 view 로 확인
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "svc.List user=%d: %v\n", u.ID, err)
			os.Exit(1)
		}
		observed := make([]ObservedEvent, 0, len(resp.Holidays)+len(resp.Leaves))
		for _, h := range resp.Holidays {
			observed = append(observed, ObservedEvent{Kind: "holiday", ID: h.ID})
		}
		for _, l := range resp.Leaves {
			observed = append(observed, ObservedEvent{Kind: "leave", ID: l.ID})
		}

		miss := CompareEvents(expected, observed)
		results = append(results, UserCheckResult{UserID: u.ID, Missing: miss})

		if len(miss) > 0 {
			logger.Warn("missing events",
				slog.Int64("user_id", u.ID),
				slog.String("email", u.Email),
				slog.Int("miss_count", len(miss)))
			for _, m := range miss {
				logger.Warn("  miss",
					slog.String("kind", m.Kind),
					slog.Int64("id", m.ID),
					slog.String("label", m.Label),
					slog.Time("date", m.Date))
			}
		}
	}

	s := Summarize(results)
	logger.Info("verify-calendar done",
		slog.Int("users_checked", s.UsersChecked),
		slog.Int("users_affected", s.UsersAffected),
		slog.Int("total_missing", s.TotalMissing),
		slog.Int("expected_total", len(expected)))

	if !s.AllPass() {
		fmt.Fprintln(os.Stderr, "FAIL — calendar missing events")
		os.Exit(1)
	}
	fmt.Println("OK — calendar contains all expected events for all users.")
}
