package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

// Handler — 인증 관련 HTTP 핸들러.
type Handler struct {
	svc *Service
}

// NewHandler — service 주입.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ---------- Register ----------

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type registerResponse struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// Register — POST /api/auth/register
func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}

	fields := validateRegister(req)
	if len(fields) > 0 {
		writeValidationFailed(c, fields)
		return
	}

	user, err := h.svc.Register(c.Request.Context(), RegisterInput{
		Email:    req.Email,
		Password: req.Password,
		Name:     req.Name,
	})
	if err != nil {
		if errors.Is(err, ErrEmailDuplicate) {
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"이미 등록된 이메일입니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.EmailDuplicate},
			))
			return
		}
		writeInternal(c)
		return
	}

	c.JSON(http.StatusCreated, apiresult.Success(registerResponse{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
	}))
}

// ---------- Login ----------

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	UserID       int64  `json:"userId"`
	Role         string `json:"role"`
}

// Login — POST /api/auth/login
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}

	if strings.TrimSpace(req.Email) == "" || req.Password == "" {
		writeValidationFailed(c, []apiresult.FieldError{
			{Field: "email", Reason: "required"},
		})
		return
	}

	pair, user, err := h.svc.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"이메일 또는 비밀번호가 올바르지 않습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.InvalidCredentials},
			))
			return
		case errors.Is(err, ErrUserTerminated):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"퇴사 처리된 계정입니다. 관리자에게 문의하세요.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.UserTerminated},
			))
			return
		default:
			writeInternal(c)
			return
		}
	}

	c.JSON(http.StatusOK, apiresult.Success(loginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		UserID:       user.ID,
		Role:         string(user.Role),
	}))
}

// ---------- Refresh ----------

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// Refresh — POST /api/auth/refresh
func (h *Handler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c)
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		writeValidationFailed(c, []apiresult.FieldError{
			{Field: "refreshToken", Reason: "required"},
		})
		return
	}

	pair, err := h.svc.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, ErrTokenExpired):
			c.JSON(http.StatusUnauthorized, apiresult.Failure(
				"토큰이 만료되었습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.TokenExpired},
			))
			return
		case errors.Is(err, ErrTokenInvalid), errors.Is(err, ErrTokenTypeMismatch),
			errors.Is(err, ErrRefreshNotFound), errors.Is(err, ErrRefreshReused),
			errors.Is(err, ErrTokenRevoked):
			c.JSON(http.StatusUnauthorized, apiresult.Failure(
				"토큰이 유효하지 않습니다. 다시 로그인해 주세요.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
			))
			return
		case errors.Is(err, ErrUserTerminated):
			c.JSON(http.StatusBadRequest, apiresult.Failure(
				"퇴사 처리된 계정입니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.UserTerminated},
			))
			return
		default:
			writeInternal(c)
			return
		}
	}

	c.JSON(http.StatusOK, apiresult.Success(loginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
	}))
}

// ---------- Logout ----------

// Logout — POST /api/auth/logout. 인증 필수.
func (h *Handler) Logout(c *gin.Context) {
	userID, ok := UserIDFrom(c)
	if !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, apiresult.Failure(
			"인증이 필요합니다.",
			&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
		))
		return
	}
	tenantID, _ := TenantIDFrom(c)
	if err := h.svc.Logout(c.Request.Context(), userID, tenantID); err != nil {
		writeInternal(c)
		return
	}
	c.JSON(http.StatusOK, apiresult.Success(struct {
		Status string `json:"status"`
	}{Status: "ok"}))
}

// ---------- helpers ----------

func validateRegister(req registerRequest) []apiresult.FieldError {
	var fields []apiresult.FieldError
	email := strings.TrimSpace(req.Email)
	if email == "" {
		fields = append(fields, apiresult.FieldError{Field: "email", Reason: "required"})
	} else if !looksLikeEmail(email) {
		fields = append(fields, apiresult.FieldError{Field: "email", Reason: "format"})
	}
	if req.Password == "" {
		fields = append(fields, apiresult.FieldError{Field: "password", Reason: "required"})
	} else if len(req.Password) < 8 {
		fields = append(fields, apiresult.FieldError{Field: "password", Reason: "min"})
	}
	if strings.TrimSpace(req.Name) == "" {
		fields = append(fields, apiresult.FieldError{Field: "name", Reason: "required"})
	}
	return fields
}

func looksLikeEmail(s string) bool {
	// 최소한의 검증 — 핵심은 RFC 가 아니라 '@' 포함 + 양쪽 길이.
	at := strings.IndexByte(s, '@')
	return at > 0 && at < len(s)-1 && !strings.ContainsAny(s, " \t")
}

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

func writeInternal(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, apiresult.Failure(
		"서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
	))
}
