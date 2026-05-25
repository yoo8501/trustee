package audit_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/audit"
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

func newAuditEng(store audit.Store, actorID int64, role permission.Role) *gin.Engine {
	svc := audit.NewService(store)
	h := audit.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/audit/attendance/list", fakeAuth(actorID, 1, role), h.AttendanceList)
	return eng
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

type recAPI struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"userId"`
	WorkDate   string  `json:"workDate"`
	CheckInAt  *string `json:"checkInAt,omitempty"`
	CheckOutAt *string `json:"checkOutAt,omitempty"`
	Source     string  `json:"source"`
	ClientIP   string  `json:"clientIp,omitempty"`
	UserAgent  string  `json:"userAgent,omitempty"`
	Status     string  `json:"status"`
}

func TestHandler_AttendanceList_Success(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{
		UserID: 1, WorkDate: mustDate("2026-05-01"),
		ClientIp: mustParseIP("10.0.0.1"),
	})
	store.seed(dbq.AttendanceRecord{
		UserID: 2, WorkDate: mustDate("2026-05-02"),
	})
	eng := newAuditEng(store, 100, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, raw)
	}
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total = %v", env.Total)
	}
	if env.Data == nil || len(*env.Data) != 2 {
		t.Fatalf("items = %+v", env.Data)
	}
}

func TestHandler_AttendanceList_FilterByUserID(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-01")})
	store.seed(dbq.AttendanceRecord{UserID: 2, WorkDate: mustDate("2026-05-01")})
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-02")})

	eng := newAuditEng(store, 100, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"userId": 1, "page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total = %v", env.Total)
	}
	for _, r := range *env.Data {
		if r.UserID != 1 {
			t.Fatalf("user id = %d", r.UserID)
		}
	}
}

func TestHandler_AttendanceList_FilterByDateRange(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-04-30")})
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-01")})
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-15")})
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-06-01")})

	eng := newAuditEng(store, 100, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"from": "2026-05-01", "to": "2026-05-31", "page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total = %v", env.Total)
	}
}

func TestHandler_AttendanceList_FilterBySource(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-01"), Source: dbq.AttendanceSourceButton})
	store.seed(dbq.AttendanceRecord{UserID: 2, WorkDate: mustDate("2026-05-01"), Source: dbq.AttendanceSourceManualCorrection})

	eng := newAuditEng(store, 100, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"source": "manual_correction", "page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 1 {
		t.Fatalf("total = %v", env.Total)
	}
}

func TestHandler_AttendanceList_FilterByClientIP(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{UserID: 1, WorkDate: mustDate("2026-05-01"), ClientIp: mustParseIP("10.0.0.1")})
	store.seed(dbq.AttendanceRecord{UserID: 2, WorkDate: mustDate("2026-05-01"), ClientIp: mustParseIP("10.0.0.2")})

	eng := newAuditEng(store, 100, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{
		"clientIp": "10.0.0.1", "page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 1 {
		t.Fatalf("total = %v", env.Total)
	}
}

func TestHandler_AttendanceList_PaginationDefaults(t *testing.T) {
	store := newFakeAuditStore()
	for i := 0; i < 5; i++ {
		store.seed(dbq.AttendanceRecord{UserID: int64(i + 1), WorkDate: mustDate("2026-05-01")})
	}
	eng := newAuditEng(store, 100, permission.RoleHRManager)
	// page / size 모두 누락 → 기본값.
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/audit/attendance/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]recAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 5 {
		t.Fatalf("total = %v", env.Total)
	}
}
