package attendance_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// fakeAuth — JWT 없이 user context 주입.
func fakeAuth(userID, tenantID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Set("auth:role", permission.RoleGeneral)
		c.Next()
	}
}

func newEng(h *attendance.Handler, userID int64) *gin.Engine {
	eng := gin.New()
	eng.POST("/api/hr/attendance/check-in", fakeAuth(userID, 1), h.CheckIn)
	eng.POST("/api/hr/attendance/check-out", fakeAuth(userID, 1), h.CheckOut)
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
	req.Header.Set("User-Agent", "test-agent/1.0")
	req.RemoteAddr = "1.2.3.4:5000"
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type attendanceAPI struct {
	ID                int64   `json:"id"`
	UserID            int64   `json:"userId"`
	WorkDate          string  `json:"workDate"`
	CheckInAt         *string `json:"checkInAt"`
	CheckOutAt        *string `json:"checkOutAt"`
	LunchBreakMinutes int32   `json:"lunchBreakMinutes"`
	Source            string  `json:"source"`
	Status            string  `json:"status"`
}

// 200 + ApiResult success + status 필드.
func TestHandler_CheckIn_Success_EnvelopeShape(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	hdl := attendance.NewHandler(svc)
	eng := newEng(hdl, 7)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-in", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}

	var env apiresult.Envelope[attendanceAPI]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, raw)
	}
	if !env.Success {
		t.Fatalf("success=false body=%s", raw)
	}
	if env.Data == nil || env.Data.Status != "normal" {
		t.Fatalf("data=%+v", env.Data)
	}
	if env.Data.CheckInAt == nil {
		t.Fatal("checkInAt nil")
	}
}

// 같은 날 두 번째 check-in — 200, 같은 ID 반환 (첫 record 보존).
func TestHandler_CheckIn_SecondClick_PreservesFirst(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	hdl := attendance.NewHandler(svc)
	eng := newEng(hdl, 7)

	_, raw1 := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-in", nil)
	var env1 apiresult.Envelope[attendanceAPI]
	_ = json.Unmarshal(raw1, &env1)

	h.now = kstAt(t, "2026-05-25 09:30")
	w2, raw2 := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-in", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("second code=%d body=%s", w2.Code, raw2)
	}
	var env2 apiresult.Envelope[attendanceAPI]
	_ = json.Unmarshal(raw2, &env2)
	if env1.Data == nil || env2.Data == nil || env1.Data.ID != env2.Data.ID {
		t.Fatalf("id mismatch first=%+v second=%+v", env1.Data, env2.Data)
	}
	if h.store.creates.Load() != 1 {
		t.Fatalf("creates=%d want 1", h.store.creates.Load())
	}
}

// 출근 없이 퇴근 → 400 + CHECK_IN_REQUIRED.
func TestHandler_CheckOut_WithoutCheckIn_400_CheckInRequired(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 18:00"))
	hdl := attendance.NewHandler(svc)
	eng := newEng(hdl, 7)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-out", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success {
		t.Fatalf("success=true body=%s", raw)
	}
	if env.Details == nil || env.Details.ErrorCode != errorcode.CheckInRequired {
		t.Fatalf("errorCode=%+v want CHECK_IN_REQUIRED", env.Details)
	}
	if env.Message == nil || *env.Message == "" {
		t.Fatal("message empty (api.md §2 위반)")
	}
}

// 출근 → 퇴근 200 + check_out_at 채워짐 + RFC3339.
func TestHandler_CheckOut_AfterCheckIn_Success(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	hdl := attendance.NewHandler(svc)
	eng := newEng(hdl, 7)

	_, _ = doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-in", nil)

	h.now = kstAt(t, "2026-05-25 18:05")
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-out", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[attendanceAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.CheckOutAt == nil {
		t.Fatalf("checkOutAt missing: %+v", env.Data)
	}
	// RFC3339 형식.
	if _, err := time.Parse(time.RFC3339, *env.Data.CheckOutAt); err != nil {
		t.Fatalf("checkOutAt not RFC3339: %s err=%v", *env.Data.CheckOutAt, err)
	}
}

// 인증 없이 호출 → 401 + UNAUTHENTICATED.
func TestHandler_CheckIn_Unauthenticated(t *testing.T) {
	h := newHarness()
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	hdl := attendance.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/attendance/check-in", hdl.CheckIn) // 인증 미들웨어 없음

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/check-in", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Unauthenticated {
		t.Fatalf("errorCode=%+v want UNAUTHENTICATED", env.Details)
	}
}
