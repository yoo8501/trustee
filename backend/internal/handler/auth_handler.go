package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seosangjun/docflow/backend/internal/model"
	"github.com/seosangjun/docflow/backend/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type registerRequest struct {
	Email      string `json:"email" binding:"required,email,max=255"`
	Password   string `json:"password" binding:"required,min=8,max=72"`
	Name       string `json:"name" binding:"required,min=1,max=100"`
	TenantName string `json:"tenant_name" binding:"required,min=1,max=255"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	result, err := h.authService.Register(c.Request.Context(), service.RegisterInput{
		Email:      req.Email,
		Password:   req.Password,
		Name:       req.Name,
		TenantName: req.TenantName,
	})
	if err != nil {
		if errors.Is(err, model.ErrEmailAlreadyExists) {
			respondError(c, http.StatusConflict, "EMAIL_ALREADY_EXISTS", "이미 사용 중인 이메일입니다")
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		return
	}

	setTokenCookies(c, result.AccessToken, result.RefreshToken)
	respondSuccess(c, http.StatusCreated, gin.H{"user": result.User})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	result, err := h.authService.Login(c.Request.Context(), service.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		if errors.Is(err, model.ErrInvalidCredentials) {
			respondError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다")
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 오류가 발생했습니다")
		return
	}

	setTokenCookies(c, result.AccessToken, result.RefreshToken)
	respondSuccess(c, http.StatusOK, gin.H{"user": result.User})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil {
		respondError(c, http.StatusUnauthorized, "INVALID_TOKEN", "Refresh Token이 없습니다")
		return
	}

	accessToken, err := h.authService.Refresh(c.Request.Context(), refreshToken)
	if err != nil {
		respondError(c, http.StatusUnauthorized, "TOKEN_EXPIRED", "토큰이 만료되었습니다. 다시 로그인하세요")
		return
	}

	setAccessTokenCookie(c, accessToken)
	respondSuccess(c, http.StatusOK, gin.H{"message": "Token refreshed"})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	clearTokenCookies(c)
	respondSuccess(c, http.StatusOK, gin.H{"message": "Logged out"})
}

func setTokenCookies(c *gin.Context, accessToken, refreshToken string) {
	setAccessTokenCookie(c, accessToken)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/api/auth/refresh",
		MaxAge:   7 * 24 * 3600,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

func setAccessTokenCookie(c *gin.Context, accessToken string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		Path:     "/",
		MaxAge:   3600,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

func clearTokenCookies(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "access_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth/refresh",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}
