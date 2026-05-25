package expensereport

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Sprint 7 - Red 단계 skeleton. Green 에서 실제 mime / size 검증 + storage.

const MaxAttachmentBytes int64 = 10 * 1024 * 1024

var (
	ErrAttachmentTooLarge = errors.New("expense_report: attachment too large")
	ErrInvalidMime        = errors.New("expense_report: invalid mime type")
	ErrNoAttachment       = errors.New("expense_report: no attachment")
)

// ValidateMime — Red 단계: 항상 ErrInvalidMime (Green 에서 채움).
func ValidateMime(_ *multipart.FileHeader) error {
	return ErrInvalidMime
}

type AttachmentStorage interface {
	Save(reportID int64, originalName string, body io.Reader) (storedPath string, err error)
	Open(storedPath string) (io.ReadCloser, int64, error)
}

type LocalAttachmentStorage struct{ BaseDir string }

func NewLocalAttachmentStorage(baseDir string) *LocalAttachmentStorage {
	return &LocalAttachmentStorage{BaseDir: baseDir}
}

func (s *LocalAttachmentStorage) Save(_ int64, _ string, _ io.Reader) (string, error) {
	return "", errNotImplemented
}
func (s *LocalAttachmentStorage) Open(_ string) (io.ReadCloser, int64, error) {
	return nil, 0, errNotImplemented
}

type AttachmentManager struct {
	storage AttachmentStorage
}

func NewAttachmentManager(storage AttachmentStorage) *AttachmentManager {
	return &AttachmentManager{storage: storage}
}

// Upload / Download — Red 단계 stub.
func (h *Handler) Upload(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, apiresult.Failure(
		"미구현 (Red 단계)",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}

func (h *Handler) Download(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, apiresult.Failure(
		"미구현 (Red 단계)",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
