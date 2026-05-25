package cron

import (
	"context"
	"errors"
	"log/slog"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// AccrualStore — accrual cron 이 사용하는 DB 의존성.
//
// 실 구현은 dbq.Queries 가 그대로 만족.
type AccrualStore interface {
	// 활성 사용자 목록 (deleted_at IS NULL AND status='active').
	ListActiveUsersForAccrual(ctx context.Context, tenantID int64) ([]dbq.User, error)
	// 활성 leave_types 목록 (적립 대상 분기 검사).
	ListActiveLeaveTypes(ctx context.Context, tenantID int64) ([]dbq.LeaveType, error)
	// 잔여 upsert (UNIQUE (user_id, leave_type_id, period_year) 활용 — 중복 적립 방지).
	UpsertLeaveBalanceGrant(ctx context.Context, arg dbq.UpsertLeaveBalanceGrantParams) (dbq.LeaveBalance, error)
	// 기존 잔여 조회 — 같은 (user, type, year) 가 이미 grant 됐는지 확인.
	GetLeaveBalanceForUserTypeYear(ctx context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error)
}

var _ AccrualStore = (*dbq.Queries)(nil)

// AccrualJob — 연차 발생 cron.
//
// 매일 02:00 KST 에 트리거 → 내부에서 사용자별 정책 분기:
//
//   - monthly_lt_one_year (월차): now.Day()==1 이고 입사 1년 미만 → 1일 적립
//   - annual_hire_anniversary (연차): now 가 입사 anniversary 이고 1년 이상 → 15일 + 근속 가산
//   - fixed / carryover — cron 적립 없음
//
// 중복 방지: leave_balances 의 (user_id, leave_type_id, period_year) UNIQUE 와
// UpsertLeaveBalanceGrant 의 ON CONFLICT DO UPDATE. 같은 anniversary 가 같은 해에
// 두 번 호출돼도 granted_hours 가 멱등하게 동일 값으로 정착한다.
// 멀티 인스턴스 보호는 AccrualScheduler.Run 의 advisory lock 으로.
type AccrualJob struct {
	store    AccrualStore
	logger   *slog.Logger
	tenantID int64
	dryRun   bool
	// clock — 테스트에서 시간을 주입할 수 있게.
	clock func() time.Time
}

// AccrualJobConfig — 의존성 묶음.
type AccrualJobConfig struct {
	Store    AccrualStore
	Logger   *slog.Logger
	TenantID int64
	DryRun   bool
	// Clock 이 nil 이면 KST 현재 시간을 사용.
	Clock func() time.Time
}

// NewAccrualJob — config 검증 후 job 생성.
func NewAccrualJob(cfg AccrualJobConfig) *AccrualJob {
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	if cfg.TenantID == 0 {
		cfg.TenantID = 1
	}
	clock := cfg.Clock
	if clock == nil {
		clock = func() time.Time { return time.Now().In(leave.KSTLocation()) }
	}
	return &AccrualJob{
		store:    cfg.Store,
		logger:   logger,
		tenantID: cfg.TenantID,
		dryRun:   cfg.DryRun,
		clock:    clock,
	}
}

// Spec — robfig/cron 표현식 (5 필드, KST 기준). 매일 02:00.
func (j *AccrualJob) Spec() string {
	return "0 2 * * *"
}

// RunResult — Run 의 결과 summary.
type RunResult struct {
	UsersScanned int
	GrantsApplied int
	GrantsSkipped int    // 이미 grant 된 (user, type, year)
	Dryrun        bool
}

// Run — 1회 실행. 호출자 (scheduler 또는 cmd/cron) 가 advisory lock 으로 감싸야 한다.
func (j *AccrualJob) Run(ctx context.Context) (RunResult, error) {
	now := j.clock()

	users, err := j.store.ListActiveUsersForAccrual(ctx, j.tenantID)
	if err != nil {
		return RunResult{}, err
	}
	leaveTypes, err := j.store.ListActiveLeaveTypes(ctx, j.tenantID)
	if err != nil {
		return RunResult{}, err
	}

	// (정책 type → leave_type) 매핑. 같은 type 가 여러 개면 첫 번째만 사용.
	policyTypeToLeaveType := make(map[leave.PolicyType]dbq.LeaveType, len(leaveTypes))
	for _, lt := range leaveTypes {
		pol, perr := leave.ParseAccrualPolicy(lt.AccrualPolicy)
		if perr != nil {
			j.logger.Warn("accrual: invalid policy on leave_type, skipping",
				slog.Int64("leave_type_id", lt.ID),
				slog.String("code", lt.Code),
				slog.String("error", perr.Error()))
			continue
		}
		if _, exists := policyTypeToLeaveType[pol.Type]; !exists {
			policyTypeToLeaveType[pol.Type] = lt
		}
	}

	res := RunResult{Dryrun: j.dryRun, UsersScanned: len(users)}

	for _, u := range users {
		if !u.HireDate.Valid {
			continue
		}
		hire := u.HireDate.Time

		for _, lt := range leaveTypes {
			pol, perr := leave.ParseAccrualPolicy(lt.AccrualPolicy)
			if perr != nil {
				continue
			}
			grantHours := pol.GrantHours(hire, now)
			if grantHours <= 0 {
				continue
			}
			// 적립할 period_year 결정.
			//   monthly_lt_one_year — 입사 연도 기준 (그 해의 월차 잔여).
			//   annual_hire_anniversary — anniversary 연도가 period_year.
			periodYear := int32(now.Year())

			// 이미 grant 되어 있고 같은 값이면 skip.
			existing, gerr := j.store.GetLeaveBalanceForUserTypeYear(ctx,
				dbq.GetLeaveBalanceForUserTypeYearParams{
					UserID: u.ID, LeaveTypeID: lt.ID, PeriodYear: periodYear, TenantID: j.tenantID,
				})
			if gerr != nil && !errors.Is(gerr, pgx.ErrNoRows) {
				j.logger.Error("accrual: get existing balance failed",
					slog.Int64("user_id", u.ID), slog.Int64("leave_type_id", lt.ID),
					slog.String("error", gerr.Error()))
				continue
			}
			alreadyGranted := gerr == nil
			if alreadyGranted {
				current := numericApprox(existing.GrantedHours)
				if approxEqual(current, leave.RoundHours(grantHours)) {
					res.GrantsSkipped++
					continue
				}
			}

			j.logger.Info("accrual: granting",
				slog.Int64("user_id", u.ID),
				slog.Int64("leave_type_id", lt.ID),
				slog.String("code", lt.Code),
				slog.Float64("hours", grantHours),
				slog.Int("period_year", int(periodYear)),
				slog.Bool("dry_run", j.dryRun),
			)

			if j.dryRun {
				res.GrantsApplied++
				continue
			}

			expiresAt := computeExpiresAt(now, pol)
			_, err := j.store.UpsertLeaveBalanceGrant(ctx, dbq.UpsertLeaveBalanceGrantParams{
				TenantID:     j.tenantID,
				UserID:       u.ID,
				LeaveTypeID:  lt.ID,
				PeriodYear:   periodYear,
				GrantedHours: numericFromFloat(grantHours),
				ExpiresAt:    expiresAt,
			})
			if err != nil {
				j.logger.Error("accrual: upsert failed",
					slog.Int64("user_id", u.ID), slog.Int64("leave_type_id", lt.ID),
					slog.String("error", err.Error()))
				continue
			}
			res.GrantsApplied++
		}
	}

	j.logger.Info("accrual: done",
		slog.Int("users", res.UsersScanned),
		slog.Int("grants_applied", res.GrantsApplied),
		slog.Int("grants_skipped", res.GrantsSkipped),
		slog.Bool("dry_run", res.Dryrun),
	)
	return res, nil
}

// computeExpiresAt — accrual_policy.ExpiresAfterMonths 기반 만료 시각 계산.
// 0 이면 Valid=false 로 비워둔다.
func computeExpiresAt(now time.Time, pol leave.AccrualPolicy) pgtype.Timestamptz {
	if pol.ExpiresAfterMonths <= 0 {
		return pgtype.Timestamptz{Valid: false}
	}
	exp := now.AddDate(0, pol.ExpiresAfterMonths, 0)
	return pgtype.Timestamptz{Time: exp, Valid: true}
}

// numericFromFloat / numericApprox — leave 패키지에서 사용한 logic 재사용 (간단 변환만 필요).
func numericFromFloat(v float64) pgtype.Numeric {
	// leave 패키지의 internal numericFromFloat 와 동일한 결과.
	// import cycle 회피를 위해 사본.
	rounded := leave.RoundHours(v)
	scaled := int64(rounded * 10)
	if rounded < 0 && float64(scaled)/10 != rounded {
		scaled--
	}
	return pgtype.Numeric{
		Int:   big.NewInt(scaled),
		Exp:   -1,
		Valid: true,
	}
}

func numericApprox(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	if f, err := n.Float64Value(); err == nil && f.Valid {
		return f.Float64
	}
	return 0
}

func approxEqual(a, b float64) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < 0.05
}
