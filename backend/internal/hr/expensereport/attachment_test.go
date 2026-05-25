package expensereport_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// buildMultipart — file part 가 있는 multipart body 생성.
// contentType 빈 문자열이면 Content-Type 헤더 미설정 (기본 octet-stream 으로 분류).
func buildMultipart(t *testing.T, fieldName, filename, contentType string, body []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="`+fieldName+`"; filename="`+filename+`"`)
	if contentType != "" {
		h.Set("Content-Type", contentType)
	}
	part, err := mw.CreatePart(h)
	if err != nil {
		t.Fatalf("create part: %v", err)
	}
	if _, err := part.Write(body); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close mw: %v", err)
	}
	return &buf, mw.FormDataContentType()
}

func seedReport(f *fakeStore, t *testing.T, id, owner int64) {
	t.Helper()
	f.reports[id] = dbq.ExpenseReport{
		ID: id, TenantID: tenantID, RequesterID: owner,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
}

func TestAttachment_Upload_Success_PDF(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	seedReport(f, t, 500, requesterID)
	storage := newFakeStorage()
	svc := newSvc(f)
	eng := engineFor(requesterID, permission.RoleGeneral, svc, expensereport.NewAttachmentManager(storage))

	body, ct := buildMultipart(t, "file", "receipt.pdf", "application/pdf", []byte("%PDF-1.4 fake"))
	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/500/attachment", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var env apiresult.Envelope[expenseData]
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if !env.Success || env.Data == nil || env.Data.AttachmentURL == "" {
		t.Fatalf("env=%+v", env)
	}
	// 파일이 실제로 저장됐는지 확인.
	if len(storage.files) != 1 {
		t.Errorf("storage files=%d want 1", len(storage.files))
	}
}

func TestAttachment_Upload_Success_PNG(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	seedReport(f, t, 501, requesterID)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	body, ct := buildMultipart(t, "file", "receipt.png", "image/png", []byte("\x89PNG\r\n"))
	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/501/attachment", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Upload_InvalidMime_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	seedReport(f, t, 502, requesterID)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	body, ct := buildMultipart(t, "file", "evil.exe", "application/octet-stream", []byte("MZ"))
	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/502/attachment", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidMimeType {
		t.Fatalf("errorCode=%v", env.Details)
	}
}

func TestAttachment_Upload_TooLarge_413(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	seedReport(f, t, 503, requesterID)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	// 11MB > 10MB limit.
	large := make([]byte, 11*1024*1024)
	body, ct := buildMultipart(t, "file", "big.pdf", "application/pdf", large)
	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/503/attachment", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Content-Length", strconv.Itoa(body.Len()))
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.FileTooLarge {
		t.Fatalf("errorCode=%v", env.Details)
	}
}

func TestAttachment_Upload_NotOwner_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	seedReport(f, t, 504, requesterID)
	storage := newFakeStorage()
	// otherUser 가 본인 아닌데 업로드 시도.
	eng := engineFor(otherUserID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	body, ct := buildMultipart(t, "file", "x.pdf", "application/pdf", []byte("x"))
	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/504/attachment", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Upload_NoFile_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	seedReport(f, t, 505, requesterID)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	// empty multipart body — file field 없음.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("other", "x")
	_ = mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/505/attachment", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Download_Success_Owner(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	storage := newFakeStorage()
	// 미리 storage 에 파일 + report 의 attachment_url 설정.
	storage.files["expense/600/receipt.pdf"] = []byte("PDFDATA")
	f.reports[600] = dbq.ExpenseReport{
		ID: 600, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID:    pgtype.Int8{Int64: managerID, Valid: true},
		AttachmentUrl: pgtype.Text{String: "expense/600/receipt.pdf", Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/600/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	body, _ := io.ReadAll(w.Body)
	if string(body) != "PDFDATA" {
		t.Errorf("body=%q want PDFDATA", string(body))
	}
}

func TestAttachment_Download_Success_Approver(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	storage := newFakeStorage()
	storage.files["expense/601/receipt.pdf"] = []byte("PDFDATA")
	f.reports[601] = dbq.ExpenseReport{
		ID: 601, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID:    pgtype.Int8{Int64: managerID, Valid: true},
		AttachmentUrl: pgtype.Text{String: "expense/601/receipt.pdf", Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/601/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Download_Success_HR(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	storage := newFakeStorage()
	storage.files["expense/602/receipt.pdf"] = []byte("PDFDATA")
	f.reports[602] = dbq.ExpenseReport{
		ID: 602, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID:    pgtype.Int8{Int64: managerID, Valid: true},
		AttachmentUrl: pgtype.Text{String: "expense/602/receipt.pdf", Valid: true},
	}
	// HR 권한.
	eng := engineFor(otherUserID, permission.RoleHRManager, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/602/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Download_NoPermission_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	storage := newFakeStorage()
	storage.files["expense/603/receipt.pdf"] = []byte("PDFDATA")
	f.reports[603] = dbq.ExpenseReport{
		ID: 603, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID:    pgtype.Int8{Int64: managerID, Valid: true},
		AttachmentUrl: pgtype.Text{String: "expense/603/receipt.pdf", Valid: true},
	}
	// 일반 사용자가 다른 사람 첨부 다운로드 시도.
	eng := engineFor(otherUserID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/603/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAttachment_Download_NoAttachment_404(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	storage := newFakeStorage()
	// attachment_url 비어있음.
	f.reports[604] = dbq.ExpenseReport{
		ID: 604, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/604/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestValidateMime_Allowed(t *testing.T) {
	cases := []struct {
		ct      string
		wantErr bool
	}{
		{"application/pdf", false},
		{"image/png", false},
		{"image/jpeg", false},
		{"image/webp", false},
		{"application/octet-stream", true},
		{"text/html", true},
		{"", true},
	}
	for _, c := range cases {
		h := &multipart.FileHeader{Header: textproto.MIMEHeader{}}
		if c.ct != "" {
			h.Header.Set("Content-Type", c.ct)
		}
		err := expensereport.ValidateMime(h)
		if (err != nil) != c.wantErr {
			t.Errorf("ValidateMime(%q) err=%v wantErr=%v", c.ct, err, c.wantErr)
		}
	}
}
