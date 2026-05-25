package teams

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — 팀 관련 HTTP 핸들러.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- DTO ----------

type teamResponse struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	ParentTeamID *int64 `json:"parentTeamId"`
	TeamLeadID   *int64 `json:"teamLeadId"`
	HRManagerID  *int64 `json:"hrManagerId"`
}

func toTeamResponse(t dbq.Team) teamResponse {
	out := teamResponse{ID: t.ID, Name: t.Name}
	if t.ParentTeamID.Valid {
		v := t.ParentTeamID.Int64
		out.ParentTeamID = &v
	}
	if t.TeamLeadID.Valid {
		v := t.TeamLeadID.Int64
		out.TeamLeadID = &v
	}
	if t.HrManagerID.Valid {
		v := t.HrManagerID.Int64
		out.HRManagerID = &v
	}
	return out
}

// ---------- Get ----------

// Get — GET /api/teams/:id
func (h *Handler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "format"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	t, err := h.svc.Get(c.Request.Context(), id, tenantID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeNotFound(c)
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toTeamResponse(t)))
}

// ---------- List ----------

type listRequest struct {
	Page int32 `json:"page"`
	Size int32 `json:"size"`
}

// List — POST /api/teams/list
func (h *Handler) List(c *gin.Context) {
	var req listRequest
	_ = c.ShouldBindJSON(&req)
	tenantID, _ := auth.TenantIDFrom(c)
	res, err := h.svc.List(c.Request.Context(), tenantID, ListInput{Page: req.Page, Size: req.Size})
	if err != nil {
		writeInternal(c)
		return
	}
	items := make([]teamResponse, 0, len(res.Items))
	for _, t := range res.Items {
		items = append(items, toTeamResponse(t))
	}
	c.JSON(http.StatusOK, apiresult.SuccessList(items, res.Total))
}

// ---------- Create ----------

type createRequest struct {
	Name         string `json:"name"`
	ParentTeamID *int64 `json:"parentTeamId,omitempty"`
	TeamLeadID   *int64 `json:"teamLeadId,omitempty"`
	HRManagerID  *int64 `json:"hrManagerId,omitempty"`
}

// Create — POST /api/teams (HR/super_admin only).
func (h *Handler) Create(c *gin.Context) {
	var req createRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.Name == "" {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "name", Reason: "required"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	t, err := h.svc.Create(c.Request.Context(), CreateInput{
		TenantID:     tenantID,
		Name:         req.Name,
		ParentTeamID: req.ParentTeamID,
		TeamLeadID:   req.TeamLeadID,
		HRManagerID:  req.HRManagerID,
	})
	if err != nil {
		writeInternal(c)
		return
	}
	c.JSON(http.StatusCreated, apiresult.Success(toTeamResponse(t)))
}

// ---------- Update ----------

type updateRequest struct {
	ID           int64   `json:"id"`
	Name         *string `json:"name,omitempty"`
	ParentSet    bool    `json:"parentSet,omitempty"`
	ParentTeamID *int64  `json:"parentTeamId,omitempty"`
	LeadSet      bool    `json:"leadSet,omitempty"`
	TeamLeadID   *int64  `json:"teamLeadId,omitempty"`
	HRSet        bool    `json:"hrSet,omitempty"`
	HRManagerID  *int64  `json:"hrManagerId,omitempty"`
}

// Update — POST /api/teams/update
func (h *Handler) Update(c *gin.Context) {
	var req updateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "required"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	t, err := h.svc.Update(c.Request.Context(), UpdateInput{
		ID:           req.ID,
		TenantID:     tenantID,
		Name:         req.Name,
		ParentSet:    req.ParentSet,
		ParentTeamID: req.ParentTeamID,
		LeadSet:      req.LeadSet,
		TeamLeadID:   req.TeamLeadID,
		HRSet:        req.HRSet,
		HRManagerID:  req.HRManagerID,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeNotFound(c)
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(toTeamResponse(t)))
}

// ---------- Delete ----------

type deleteRequest struct {
	ID int64 `json:"id"`
}

// Delete — POST /api/teams/delete (soft delete).
func (h *Handler) Delete(c *gin.Context) {
	var req deleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if req.ID <= 0 {
		writeValidationFailed(c, []apiresult.FieldError{{Field: "id", Reason: "required"}})
		return
	}
	tenantID, _ := auth.TenantIDFrom(c)
	if err := h.svc.Delete(c.Request.Context(), req.ID, tenantID); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeNotFound(c)
			return
		}
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(struct {
		Status string `json:"status"`
	}{Status: "ok"}))
}

// ---------- helpers ----------

func writeInvalidRequest(c *gin.Context) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"요청 형식이 잘못되었습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidRequest},
	))
}

func writeValidationFailed(c *gin.Context, fields []apiresult.FieldError) {
	c.JSON(http.StatusBadRequest, apiresult.Failure(
		"입력값을 확인해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.ValidationFailed, Fields: fields},
	))
}

func writeNotFound(c *gin.Context) {
	c.JSON(http.StatusNotFound, apiresult.Failure(
		"팀을 찾을 수 없습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.NotFound},
	))
}

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
