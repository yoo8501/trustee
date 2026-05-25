package expensereport

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// MaxAttachmentBytes — 첨부 파일 최대 크기 (10MB).
const MaxAttachmentBytes int64 = 10 * 1024 * 1024

// allowedMimes — 허용 mime type (PDF). image/* 는 prefix 검사로 별도 처리.
var allowedMimes = map[string]bool{
	"application/pdf": true,
}

// ErrAttachmentTooLarge — 파일 크기 초과 (413).
var ErrAttachmentTooLarge = errors.New("expense_report: attachment too large")

// ErrInvalidMime — 허용되지 않는 mime type (400).
var ErrInvalidMime = errors.New("expense_report: invalid mime type")

// ErrNoAttachment — 첨부 없음 (404).
var ErrNoAttachment = errors.New("expense_report: no attachment")

// ValidateMime — multipart header 의 Content-Type 으로 허용 여부 판단.
// image/* prefix 또는 allowedMimes 매칭 시 허용.
func ValidateMime(header *multipart.FileHeader) error {
	ct := header.Header.Get("Content-Type")
	if ct == "" {
		return ErrInvalidMime
	}
	if allowedMimes[ct] {
		return nil
	}
	if strings.HasPrefix(ct, "image/") {
		return nil
	}
	return ErrInvalidMime
}

// AttachmentStorage — 첨부 저장 추상화. 테스트에서 in-memory 구현 사용.
//
// Save 는 (storedPath, error). storedPath 는 expense_reports.attachment_url 컬럼에 저장.
// Open 은 reader + size + err 반환. 호출자가 Close 책임.
type AttachmentStorage interface {
	Save(reportID int64, originalName string, body io.Reader) (storedPath string, err error)
	Open(storedPath string) (io.ReadCloser, int64, error)
}

// LocalAttachmentStorage — 로컬 파일시스템 기반 구현.
//
// 경로 구조: {BaseDir}/expense/{reportID}/{uuid}-{originalName}.
// attachment_url 에는 expense/{reportID}/{uuid}-{originalName} 의 상대 경로 저장.
type LocalAttachmentStorage struct {
	BaseDir string
}

// NewLocalAttachmentStorage — base dir 주입. dir 없으면 생성 시도.
func NewLocalAttachmentStorage(baseDir string) *LocalAttachmentStorage {
	if baseDir == "" {
		baseDir = "./uploads"
	}
	return &LocalAttachmentStorage{BaseDir: baseDir}
}

func (s *LocalAttachmentStorage) Save(reportID int64, originalName string, body io.Reader) (string, error) {
	cleanName := sanitizeFilename(originalName)
	if cleanName == "" {
		cleanName = "attachment"
	}
	stored := fmt.Sprintf("expense/%d/%s-%s", reportID, uuid.NewString(), cleanName)
	absPath := filepath.Join(s.BaseDir, stored)
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", err
	}
	f, err := os.Create(absPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, body); err != nil {
		return "", err
	}
	return stored, nil
}

func (s *LocalAttachmentStorage) Open(storedPath string) (io.ReadCloser, int64, error) {
	abs := filepath.Join(s.BaseDir, filepath.Clean("/"+storedPath))
	// path traversal 차단 — baseDir 밖이면 거부.
	absBase, _ := filepath.Abs(s.BaseDir)
	absFull, _ := filepath.Abs(abs)
	if !strings.HasPrefix(absFull, absBase) {
		return nil, 0, ErrNoAttachment
	}
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, 0, ErrNoAttachment
		}
		return nil, 0, err
	}
	f, err := os.Open(abs)
	if err != nil {
		return nil, 0, err
	}
	return f, info.Size(), nil
}

// sanitizeFilename — 파일명에서 path separator 제거. attachment URL 안전성.
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, "..", "_")
	return strings.TrimSpace(name)
}

// AttachmentManager — handler 가 사용하는 첨부 업로드/다운로드 처리기.
type AttachmentManager struct {
	storage AttachmentStorage
}

// NewAttachmentManager — storage 주입.
func NewAttachmentManager(storage AttachmentStorage) *AttachmentManager {
	return &AttachmentManager{storage: storage}
}

// Upload — POST /api/hr/expense-reports/:id/attachment.
//
// 본인만 업로드 가능. 파일 mime / size 검증 → storage.Save → service.UpdateAttachmentURL.
func (h *Handler) Upload(c *gin.Context) {
	if h.attach == nil {
		writeInternal(c)
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)

	// 권한: 본인만 업로드 가능.
	r, err := h.svc.GetRaw(c.Request.Context(), id, tenantID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if r.RequesterID != actorID {
		writeForbidden(c)
		return
	}

	// MaxMultipartMemory 와 별개로 명시적 limit — request body 자체를 차단.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxAttachmentBytes+1024)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "request body too large") {
			writeFileTooLarge(c)
			return
		}
		writeValidationFailed(c, []apiresult.FieldError{{Field: "file", Reason: "required"}})
		return
	}
	if fileHeader.Size > MaxAttachmentBytes {
		writeFileTooLarge(c)
		return
	}
	if err := ValidateMime(fileHeader); err != nil {
		writeInvalidMime(c)
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		writeInternal(c)
		return
	}
	defer f.Close()

	storedPath, err := h.attach.storage.Save(id, fileHeader.Filename, f)
	if err != nil {
		writeInternal(c)
		return
	}

	v, err := h.svc.UpdateAttachmentURL(c.Request.Context(), id, tenantID, storedPath)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toResponse(v)))
}

// Download — GET /api/hr/expense-reports/:id/attachment.
//
// 권한: 본인 + 결재자 + HR/super_admin + 위임자.
func (h *Handler) Download(c *gin.Context) {
	if h.attach == nil {
		writeInternal(c)
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}

	actorID, _ := auth.UserIDFrom(c)
	tenantID, _ := auth.TenantIDFrom(c)
	role, _ := auth.RoleFrom(c)
	hrOrAbove := permission.IsHRManagerOrAbove(role)

	r, err := h.svc.GetRaw(c.Request.Context(), id, tenantID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if !h.svc.CanView(c.Request.Context(), r, actorID, hrOrAbove) {
		writeForbidden(c)
		return
	}
	if !r.AttachmentUrl.Valid || r.AttachmentUrl.String == "" {
		writeNotFound(c, "첨부 파일이 없습니다.")
		return
	}

	reader, size, err := h.attach.storage.Open(r.AttachmentUrl.String)
	if err != nil {
		if errors.Is(err, ErrNoAttachment) {
			writeNotFound(c, "첨부 파일이 없습니다.")
			return
		}
		writeInternal(c)
		return
	}
	defer reader.Close()

	c.Header("Content-Length", strconv.FormatInt(size, 10))
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(r.AttachmentUrl.String)))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, reader)
}

// ---------- error writers (attachment-specific) ----------

func writeFileTooLarge(c *gin.Context) {
	c.JSON(http.StatusRequestEntityTooLarge, apiresult.Failure(
		"첨부 파일 크기가 최대 10MB 를 초과합니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.FileTooLarge},
	))
}

func writeInvalidMime(c *gin.Context) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"첨부 파일은 이미지 또는 PDF 만 가능합니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidMimeType},
	))
}
