package expensereport_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
)

// fakeStore — expensereport.Store + TxStore + TxManager in-memory 통합 구현.
type fakeStore struct {
	mu       sync.Mutex
	reports  map[int64]dbq.ExpenseReport
	users    map[int64]dbq.User
	teams    map[int64]dbq.Team
	nextRep  int64

	createCount int
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		reports: map[int64]dbq.ExpenseReport{},
		users:   map[int64]dbq.User{},
		teams:   map[int64]dbq.Team{},
	}
}

// ---- snapshot for tx rollback ----

func (f *fakeStore) snapshot() *fakeStore {
	dst := newFakeStore()
	for k, v := range f.reports {
		dst.reports[k] = v
	}
	for k, v := range f.users {
		dst.users[k] = v
	}
	for k, v := range f.teams {
		dst.teams[k] = v
	}
	dst.nextRep = f.nextRep
	dst.createCount = f.createCount
	return dst
}

func (f *fakeStore) restoreFrom(src *fakeStore) {
	f.reports = src.reports
	f.users = src.users
	f.teams = src.teams
	f.nextRep = src.nextRep
	f.createCount = src.createCount
}

// ---- TxManager ----

func (f *fakeStore) WithTx(ctx context.Context, fn func(expensereport.TxStore) error) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	snap := f.snapshot()
	if err := fn(f); err != nil {
		f.restoreFrom(snap)
		return err
	}
	return nil
}

// ---- seeders ----

func (f *fakeStore) seedUser(u dbq.User) dbq.User {
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	f.users[u.ID] = u
	return u
}

func (f *fakeStore) seedTeam(t dbq.Team) dbq.Team {
	if t.TenantID == 0 {
		t.TenantID = 1
	}
	f.teams[t.ID] = t
	return t
}

// ---- Store impl: expense_reports ----

func (f *fakeStore) GetExpenseReportByID(_ context.Context, arg dbq.GetExpenseReportByIDParams) (dbq.ExpenseReport, error) {
	r, ok := f.reports[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.ExpenseReport{}, pgx.ErrNoRows
	}
	return r, nil
}

func (f *fakeStore) GetExpenseReportForUpdate(_ context.Context, arg dbq.GetExpenseReportForUpdateParams) (dbq.ExpenseReport, error) {
	r, ok := f.reports[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.ExpenseReport{}, pgx.ErrNoRows
	}
	return r, nil
}

func (f *fakeStore) CreateExpenseReport(_ context.Context, arg dbq.CreateExpenseReportParams) (dbq.ExpenseReport, error) {
	f.nextRep++
	r := dbq.ExpenseReport{
		ID:          f.nextRep,
		TenantID:    arg.TenantID,
		RequesterID: arg.RequesterID,
		AmountWon:   arg.AmountWon,
		Vendor:      arg.Vendor,
		Purpose:     arg.Purpose,
		PaidAt:      arg.PaidAt,
		Status:      dbq.LeaveRequestStatusPending,
		ApproverID:  arg.ApproverID,
		CreatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.reports[r.ID] = r
	f.createCount++
	return r, nil
}

func (f *fakeStore) UpdateExpenseReportDecision(_ context.Context, arg dbq.UpdateExpenseReportDecisionParams) (dbq.ExpenseReport, error) {
	r, ok := f.reports[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.ExpenseReport{}, pgx.ErrNoRows
	}
	r.Status = arg.Status
	r.ApproverID = arg.ApproverID
	r.DecidedAt = arg.DecidedAt
	r.DecisionComment = arg.DecisionComment
	r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.reports[r.ID] = r
	return r, nil
}

func (f *fakeStore) CancelExpenseReport(_ context.Context, arg dbq.CancelExpenseReportParams) (dbq.ExpenseReport, error) {
	r, ok := f.reports[arg.ID]
	if !ok || r.TenantID != arg.TenantID || r.RequesterID != arg.RequesterID || r.Status != dbq.LeaveRequestStatusPending {
		return dbq.ExpenseReport{}, pgx.ErrNoRows
	}
	r.Status = dbq.LeaveRequestStatusCancelled
	r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.reports[r.ID] = r
	return r, nil
}

func (f *fakeStore) UpdateExpenseReportAttachment(_ context.Context, arg dbq.UpdateExpenseReportAttachmentParams) (dbq.ExpenseReport, error) {
	r, ok := f.reports[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.ExpenseReport{}, pgx.ErrNoRows
	}
	r.AttachmentUrl = arg.AttachmentUrl
	r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.reports[r.ID] = r
	return r, nil
}

func (f *fakeStore) ListExpenseReportsByRequester(_ context.Context, arg dbq.ListExpenseReportsByRequesterParams) ([]dbq.ExpenseReport, error) {
	var out []dbq.ExpenseReport
	for _, r := range f.reports {
		if r.TenantID == arg.TenantID && r.RequesterID == arg.RequesterID {
			out = append(out, r)
		}
	}
	start := int(arg.Offset)
	if start > len(out) {
		start = len(out)
	}
	end := start + int(arg.Limit)
	if end > len(out) {
		end = len(out)
	}
	return out[start:end], nil
}

func (f *fakeStore) CountExpenseReportsByRequester(_ context.Context, arg dbq.CountExpenseReportsByRequesterParams) (int64, error) {
	var n int64
	for _, r := range f.reports {
		if r.TenantID == arg.TenantID && r.RequesterID == arg.RequesterID {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) ListPendingExpenseReportsByApprover(_ context.Context, arg dbq.ListPendingExpenseReportsByApproverParams) ([]dbq.ExpenseReport, error) {
	var out []dbq.ExpenseReport
	for _, r := range f.reports {
		if r.TenantID != arg.TenantID || !r.ApproverID.Valid || r.ApproverID.Int64 != arg.ApproverID.Int64 {
			continue
		}
		if r.Status != dbq.LeaveRequestStatusPending {
			continue
		}
		out = append(out, r)
	}
	start := int(arg.Offset)
	if start > len(out) {
		start = len(out)
	}
	end := start + int(arg.Limit)
	if end > len(out) {
		end = len(out)
	}
	return out[start:end], nil
}

func (f *fakeStore) CountPendingExpenseReportsByApprover(_ context.Context, arg dbq.CountPendingExpenseReportsByApproverParams) (int64, error) {
	var n int64
	for _, r := range f.reports {
		if r.TenantID == arg.TenantID && r.ApproverID.Valid && r.ApproverID.Int64 == arg.ApproverID.Int64 && r.Status == dbq.LeaveRequestStatusPending {
			n++
		}
	}
	return n, nil
}

// ---- users / teams ----

func (f *fakeStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) GetTeamByID(_ context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return dbq.Team{}, pgx.ErrNoRows
	}
	return t, nil
}

// ---- in-memory AttachmentStorage ----

type fakeStorage struct {
	mu    sync.Mutex
	files map[string][]byte
	// 강제 에러 주입 (테스트용).
	saveErr error
	openErr error
}

func newFakeStorage() *fakeStorage {
	return &fakeStorage{files: map[string][]byte{}}
}

func (s *fakeStorage) Save(reportID int64, originalName string, body io.Reader) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saveErr != nil {
		return "", s.saveErr
	}
	buf, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	path := "expense/" + itoa(reportID) + "/" + originalName
	s.files[path] = buf
	return path, nil
}

func (s *fakeStorage) Open(storedPath string) (io.ReadCloser, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.openErr != nil {
		return nil, 0, s.openErr
	}
	b, ok := s.files[storedPath]
	if !ok {
		return nil, 0, expensereport.ErrNoAttachment
	}
	return io.NopCloser(bytes.NewReader(b)), int64(len(b)), nil
}

// itoa — strconv.FormatInt(reportID, 10) 와 동일이지만 import 최소화.
func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// pgDate — date helper.
func pgDate(t time.Time) pgtype.Date {
	if t.IsZero() {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: t, Valid: true}
}

// 보장: fakeStore 는 Store + TxStore + TxManager.
var (
	_ expensereport.Store     = (*fakeStore)(nil)
	_ expensereport.TxStore   = (*fakeStore)(nil)
	_ expensereport.TxManager = (*fakeStore)(nil)
)

// 보장: fakeStorage 는 AttachmentStorage.
var _ expensereport.AttachmentStorage = (*fakeStorage)(nil)

// makeReader — io.Reader helper (테스트에서 stream 만들 때).
func makeReader(b []byte) io.Reader {
	return bytes.NewReader(b)
}

// errInjector — 외부에서 직접 io.EOF 던지고 싶을 때 사용.
var errInjected = errors.New("injected")
