package holiday_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/holiday"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func fakeAuth(userID, tenantID int64, role permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Set("auth:role", role)
		c.Next()
	}
}

func doJSON(t *testing.T, eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

// fakeHolidayStore — in-memory holiday store.
type fakeHolidayStore struct {
	items map[int64]dbq.Holiday
	next  int64
}

func newFakeHolidayStore() *fakeHolidayStore {
	return &fakeHolidayStore{items: map[int64]dbq.Holiday{}}
}

func (f *fakeHolidayStore) seed(date string, name string) dbq.Holiday {
	f.next++
	d, _ := time.Parse("2006-01-02", date)
	h := dbq.Holiday{
		ID: f.next, TenantID: 1, Name: name, CountryCode: "KR",
		Date:      pgtype.Date{Time: d, Valid: true},
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.items[h.ID] = h
	return h
}

func (f *fakeHolidayStore) GetHolidayByID(_ context.Context, arg dbq.GetHolidayByIDParams) (dbq.Holiday, error) {
	h, ok := f.items[arg.ID]
	if !ok || h.TenantID != arg.TenantID {
		return dbq.Holiday{}, pgx.ErrNoRows
	}
	return h, nil
}

func (f *fakeHolidayStore) ListHolidays(_ context.Context, tenantID int64) ([]dbq.Holiday, error) {
	out := []dbq.Holiday{}
	for _, h := range f.items {
		if h.TenantID == tenantID {
			out = append(out, h)
		}
	}
	return out, nil
}

func (f *fakeHolidayStore) ListHolidaysInRange(_ context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	out := []dbq.Holiday{}
	for _, h := range f.items {
		if h.TenantID != arg.TenantID || !h.Date.Valid {
			continue
		}
		if h.Date.Time.Before(arg.Date.Time) || h.Date.Time.After(arg.Date_2.Time) {
			continue
		}
		out = append(out, h)
	}
	return out, nil
}

func (f *fakeHolidayStore) CountHolidays(_ context.Context, tenantID int64) (int64, error) {
	var n int64
	for _, h := range f.items {
		if h.TenantID == tenantID {
			n++
		}
	}
	return n, nil
}

type holidayAPI struct {
	ID          int64  `json:"id"`
	Date        string `json:"date"`
	Name        string `json:"name"`
	CountryCode string `json:"countryCode"`
}

func TestHolidayHandler_List_Success(t *testing.T) {
	store := newFakeHolidayStore()
	store.seed("2026-01-01", "신정")
	store.seed("2026-03-01", "삼일절")
	svc := holiday.NewService(store)
	h := holiday.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/holidays/list", fakeAuth(1, 1, permission.RoleGeneral), h.List)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/holidays/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]holidayAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total=%v", env.Total)
	}
}

func TestHolidayHandler_List_DateRange(t *testing.T) {
	store := newFakeHolidayStore()
	store.seed("2026-01-01", "신정")
	store.seed("2026-03-01", "삼일절")
	store.seed("2026-12-25", "성탄절")
	svc := holiday.NewService(store)
	h := holiday.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/holidays/list", fakeAuth(1, 1, permission.RoleGeneral), h.List)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/holidays/list", map[string]any{
		"from": "2026-02-01", "to": "2026-06-30",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]holidayAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 1 {
		t.Fatalf("total=%v want 1", env.Total)
	}
}

func TestHolidayService_Get(t *testing.T) {
	store := newFakeHolidayStore()
	h := store.seed("2026-01-01", "신정")
	svc := holiday.NewService(store)
	v, err := svc.Get(context.Background(), h.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if v.Name != "신정" {
		t.Fatalf("name=%q", v.Name)
	}

	if _, err := svc.Get(context.Background(), 999, 1); err == nil {
		t.Fatal("expected not found")
	}
}

func TestHolidayHandler_List_BadDateFormat(t *testing.T) {
	store := newFakeHolidayStore()
	svc := holiday.NewService(store)
	h := holiday.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/holidays/list", fakeAuth(1, 1, permission.RoleGeneral), h.List)

	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/holidays/list", map[string]any{
		"from": "garbage", "to": "2026-12-31",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}
