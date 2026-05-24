package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/seosangjun/docflow/backend/internal/middleware"
	"github.com/seosangjun/docflow/backend/internal/model"
	"github.com/seosangjun/docflow/backend/internal/service"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)

	user, err := h.userService.GetByID(c.Request.Context(), userID, tenantID)
	if err != nil {
		respondError(c, http.StatusNotFound, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다")
		return
	}

	respondSuccess(c, http.StatusOK, user)
}

type updateMeRequest struct {
	Name string `json:"name" binding:"required,min=1,max=100"`
}

func (h *UserHandler) UpdateMe(c *gin.Context) {
	var req updateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)

	user, err := h.userService.UpdateName(c.Request.Context(), userID, tenantID, req.Name)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		return
	}

	respondSuccess(c, http.StatusOK, user)
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8,max=72"`
}

func (h *UserHandler) ChangePassword(c *gin.Context) {
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)

	err := h.userService.ChangePassword(c.Request.Context(), userID, tenantID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrInvalidCurrentPassword):
			respondError(c, http.StatusBadRequest, "INVALID_CURRENT_PASSWORD", "현재 비밀번호가 올바르지 않습니다")
		case errors.Is(err, model.ErrSamePassword):
			respondError(c, http.StatusBadRequest, "SAME_PASSWORD", "새 비밀번호가 현재 비밀번호와 동일합니다")
		default:
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		}
		return
	}

	respondSuccess(c, http.StatusOK, gin.H{"message": "Password changed"})
}

func (h *UserHandler) ListUsers(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	result, err := h.userService.ListUsers(c.Request.Context(), tenantID, int32(limit), int32(offset))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		return
	}

	respondList(c, result.Users, result.Total)
}

type updateUserRoleRequest struct {
	Role string `json:"role" binding:"required,oneof=admin user"`
}

func (h *UserHandler) UpdateUserRole(c *gin.Context) {
	var req updateUserRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	targetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", "유효하지 않은 사용자 ID입니다")
		return
	}

	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)

	user, err := h.userService.UpdateRole(c.Request.Context(), targetID, userID, tenantID, req.Role)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrCannotChangeOwnRole):
			respondError(c, http.StatusBadRequest, "CANNOT_CHANGE_OWN_ROLE", "자기 자신의 역할은 변경할 수 없습니다")
		case errors.Is(err, model.ErrUserNotFound):
			respondError(c, http.StatusNotFound, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다")
		default:
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		}
		return
	}

	respondSuccess(c, http.StatusOK, user)
}
