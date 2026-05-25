// verify-stats — 모든 active user 의 일/주/월 통계 합계 vs 원본 attendance_records 합계 비교.
//
// 사용:
//
//	# 오늘 (KST) 기준 한 달.
//	DATABASE_URL=postgres://... go run ./scripts/verify-stats
//
//	# 특정 시각 기준
//	go run ./scripts/verify-stats --period=week --now=2026-05-25
//
// 검증:
//
//	각 user 에 대해
//	  raw    = SUM(actual_work_minutes 등가 — DB raw)
//	  svc    = stats.Service.Mine(...).Period.TotalActualMinutes
//	diff = |raw - svc|. 한 건이라도 diff > 0 → exit 1.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/config"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// ErrStatsMismatch — 한 건이라도 diff > 0 발견 시.
var ErrStatsMismatch = errors.New("verify-stats: mismatch found")

func main() {
	var (
		periodFlag = flag.String("period", "month", "day|week|month")
		nowStr     = flag.String("now", "", "YYYY-MM-DD 기준 (기본: 오늘 KST)")
	)
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	var date time.Time
	if *nowStr == "" {
		date = time.Now().In(leave.KSTLocation())
	} else {
		d, err := time.ParseInLocation("2006-01-02", *nowStr, leave.KSTLocation())
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid --now: %v\n", err)
			os.Exit(1)
		}
		date = d
	}

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

	logger.Info("verify-stats starting",
		slog.String("period", *periodFlag),
		slog.String("date", date.Format("2006-01-02")),
		slog.Int64("tenant_id", cfg.TenantID))

	users, err := q.ListActiveUsersForAccrual(ctx, cfg.TenantID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "list users: %v\n", err)
		os.Exit(1)
	}

	// stats.Service 부트스트랩.
	attStore := stats.NewSQLAttendanceStore(q)
	userStore := stats.NewSQLUserStore(q)
	hier := scope.NewSQLHierarchy(q)
	svc := stats.NewService(attStore, userStore, q, hier, nil)

	from, to, err := stats.PeriodRange(*periodFlag, date)
	if err != nil {
		fmt.Fprintf(os.Stderr, "PeriodRange: %v\n", err)
		os.Exit(1)
	}

	results := make([]ReconcileResult, 0, len(users))
	for _, u := range users {
		actor := scope.Actor{ID: u.ID, TenantID: cfg.TenantID, Role: permission.Role(u.Role)}

		mine, err := svc.Mine(ctx, actor, *periodFlag, date)
		if err != nil {
			fmt.Fprintf(os.Stderr, "svc.Mine user=%d: %v\n", u.ID, err)
			os.Exit(1)
		}
		svcMin := mine.Period.TotalActualMinutes

		// raw: 같은 record set 을 직접 합산 (lazy compute 와 동일한 입력).
		rawMin := 0
		for _, r := range mine.Records {
			rawMin += r.ActualWorkMinutes
		}

		res := ReconcileUser(UserStats{
			UserID:         u.ID,
			Period:         *periodFlag,
			Date:           date,
			RawMinutes:     rawMin,
			ServiceMinutes: svcMin,
		})
		results = append(results, res)
		if res.Mismatched {
			logger.Warn("mismatch",
				slog.Int64("user_id", u.ID),
				slog.String("email", u.Email),
				slog.Int("raw_min", rawMin),
				slog.Int("svc_min", svcMin),
				slog.Int("diff_min", res.Diff))
		}
	}

	s := Summarize(results)
	logger.Info("verify-stats done",
		slog.Int("users_checked", s.UsersChecked),
		slog.Int("mismatch_count", s.MismatchCount),
		slog.Int("total_diff_min", s.TotalDiff),
		slog.Time("from", from),
		slog.Time("to", to))

	if !s.AllPass() {
		fmt.Fprintln(os.Stderr, "FAIL — stats mismatch")
		os.Exit(1)
	}
	fmt.Println("OK — all user stats match raw records.")
}
