// verify-accrual — 연차 발생 cron 실행 후 LeaveBalance 가 기대치와 일치하는지 검증.
//
// 흐름:
//  1. DATABASE_URL 로 connect.
//  2. 모든 active user / active leave_type 조회.
//  3. 각 (user, leave_type) 에 대해 accrual_policy.GrantHours(hireDate, --now) 로 기대값 계산.
//  4. 실제 leave_balances.granted_hours 가 기대값과 일치하는지 검증.
//  5. 차이가 1건이라도 있으면 exit 1 + 차이 목록 출력. 없으면 exit 0.
//
// 사용 예:
//
//	# 오늘 (KST) 기준 검증
//	go run ./scripts/verify-accrual
//
//	# 특정 시각 기준 검증 (cron 시뮬레이션)
//	go run ./scripts/verify-accrual --now=2026-01-15
//
//	# tenant 지정
//	DOCFLOW_TENANT_ID=2 go run ./scripts/verify-accrual
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/config"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

func main() {
	var (
		nowStr = flag.String("now", "", "YYYY-MM-DD 기준 시각 (기본: 오늘 KST)")
	)
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	var now time.Time
	if *nowStr == "" {
		now = time.Now().In(leave.KSTLocation())
	} else {
		d, err := time.ParseInLocation("2006-01-02", *nowStr, leave.KSTLocation())
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid --now: %v\n", err)
			os.Exit(1)
		}
		now = d
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db pool open: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "db ping: %v\n", err)
		os.Exit(1)
	}
	q := dbq.New(pool)

	logger.Info("verify-accrual starting",
		slog.String("now", now.Format(time.RFC3339)),
		slog.Int64("tenant_id", cfg.TenantID))

	users, err := q.ListActiveUsersForAccrual(ctx, cfg.TenantID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "list users: %v\n", err)
		os.Exit(1)
	}
	leaveTypes, err := q.ListActiveLeaveTypes(ctx, cfg.TenantID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "list leave_types: %v\n", err)
		os.Exit(1)
	}

	type diff struct {
		userID      int64
		ltCode      string
		periodYear  int32
		expected    float64
		actual      float64
	}
	var diffs []diff
	var checked int

	for _, u := range users {
		if !u.HireDate.Valid {
			continue
		}
		for _, lt := range leaveTypes {
			pol, perr := leave.ParseAccrualPolicy(lt.AccrualPolicy)
			if perr != nil {
				continue
			}
			grant := pol.GrantHours(u.HireDate.Time, now)
			if grant <= 0 {
				continue
			}
			checked++
			periodYear := int32(now.Year())

			row, err := q.GetLeaveBalanceForUserTypeYear(ctx, dbq.GetLeaveBalanceForUserTypeYearParams{
				UserID: u.ID, LeaveTypeID: lt.ID, PeriodYear: periodYear, TenantID: cfg.TenantID,
			})
			actual := 0.0
			if err != nil && err != pgx.ErrNoRows {
				fmt.Fprintf(os.Stderr, "balance lookup user=%d type=%s: %v\n", u.ID, lt.Code, err)
				os.Exit(2)
			}
			if err == nil && row.GrantedHours.Valid {
				f, ferr := row.GrantedHours.Float64Value()
				if ferr == nil && f.Valid {
					actual = f.Float64
				}
			}

			if !approxEqual(actual, leave.RoundHours(grant)) {
				diffs = append(diffs, diff{
					userID: u.ID, ltCode: lt.Code, periodYear: periodYear,
					expected: leave.RoundHours(grant), actual: actual,
				})
			}
		}
	}

	logger.Info("verify-accrual done",
		slog.Int("users", len(users)),
		slog.Int("leave_types", len(leaveTypes)),
		slog.Int("checked", checked),
		slog.Int("diffs", len(diffs)),
	)

	if len(diffs) > 0 {
		fmt.Fprintln(os.Stderr, "DIFF FOUND:")
		for _, d := range diffs {
			fmt.Fprintf(os.Stderr, "  user_id=%d leave_type=%s period_year=%d expected=%.1f actual=%.1f\n",
				d.userID, d.ltCode, d.periodYear, d.expected, d.actual)
		}
		os.Exit(1)
	}
	fmt.Println("OK — all expected accruals match.")
}

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) < 0.05
}
