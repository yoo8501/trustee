package expensereport

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Sprint 7 - Red 단계 skeleton. Green 에서 실제 핸들러 구현.

type Handler struct {
	svc    *Service
	attach *AttachmentManager
}

func NewHandler(svc *Service, attach *AttachmentManager) *Handler {
	return &Handler{svc: svc, attach: attach}
}

func notImplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, apiresult.Failure(
		"미구현 (Red 단계)",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}

func (h *Handler) Create(c *gin.Context)        { notImplemented(c) }
func (h *Handler) Get(c *gin.Context)           { notImplemented(c) }
func (h *Handler) MyList(c *gin.Context)        { notImplemented(c) }
func (h *Handler) PendingList(c *gin.Context)   { notImplemented(c) }
func (h *Handler) Approve(c *gin.Context)       { notImplemented(c) }
func (h *Handler) Reject(c *gin.Context)        { notImplemented(c) }
func (h *Handler) Cancel(c *gin.Context)        { notImplemented(c) }
