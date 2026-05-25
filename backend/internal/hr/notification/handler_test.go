package notification_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/hr/notification"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

func engineFor(userID int64, svc *notification.Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	eng := gin.New()
	eng.Use(func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Next()
	})
	h := notification.NewHandler(svc)
	eng.POST("/api/hr/notifications/list", h.List)
	eng.POST("/api/hr/notifications/:id/read", h.Read)
	eng.POST("/api/hr/notifications/read-all", h.ReadAll)
	return eng
}

func doJSON(eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type notificationData struct {
	ID         int64   `json:"id"`
	Type       string  `json:"type"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	RelatedURL string  `json:"relatedUrl,omitempty"`
	ReadAt     *string `json:"readAt,omitempty"`
	CreatedAt  string  `json:"createdAt"`
}

func TestHandler_List_Envelope_HasTotal(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t1", Body: "b"})
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t2", Body: "b"})

	eng := engineFor(userA, svc)
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/list", map[string]any{"page": 1, "size": 10})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]notificationData]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success || env.Data == nil || env.Total == nil {
		t.Fatalf("env=%+v", env)
	}
	if *env.Total != 2 || len(*env.Data) != 2 {
		t.Errorf("total=%d items=%d want 2/2", *env.Total, len(*env.Data))
	}
}

func TestHandler_List_UnreadOnly(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t1", Body: "b"})
	full, _ := svc.List(t.Context(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})
	_, _ = svc.Read(t.Context(), tenantID, userA, full.Items[0].ID)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t2", Body: "b"})

	eng := engineFor(userA, svc)
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/list", map[string]any{"page": 1, "size": 10, "unreadOnly": true})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]notificationData]
	_ = json.Unmarshal(raw, &env)
	if *env.Total != 1 {
		t.Errorf("unread total=%d want 1", *env.Total)
	}
}

func TestHandler_Read_Success_200(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t1", Body: "b"})
	full, _ := svc.List(t.Context(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})

	eng := engineFor(userA, svc)
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/"+strconv.FormatInt(full.Items[0].ID, 10)+"/read", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[notificationData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || env.Data.ReadAt == nil {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Read_NotOwn_404(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t1", Body: "b"})
	full, _ := svc.List(t.Context(), tenantID, userA, notification.ListInput{Page: 1, Size: 10})

	// userB 로 호출.
	eng := engineFor(userB, svc)
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/"+strconv.FormatInt(full.Items[0].ID, 10)+"/read", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Read_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	eng := engineFor(userA, newSvc(f))
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/abc/read", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_ReadAll_200(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t1", Body: "b"})
	_ = svc.Notify(t.Context(), tenantID, userA, notification.NewNotification{Type: "x", Title: "t2", Body: "b"})

	eng := engineFor(userA, svc)
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/notifications/read-all", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	// 응답 body 는 affected count 동봉.
	type affected struct {
		Affected int64 `json:"affected"`
	}
	var env apiresult.Envelope[affected]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || env.Data.Affected != 2 {
		t.Fatalf("env=%+v want affected=2", env)
	}
}
