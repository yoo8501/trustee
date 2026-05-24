package model

import "errors"

var (
	ErrInvalidCredentials    = errors.New("INVALID_CREDENTIALS")
	ErrEmailAlreadyExists    = errors.New("EMAIL_ALREADY_EXISTS")
	ErrInvalidToken          = errors.New("INVALID_TOKEN")
	ErrTokenExpired          = errors.New("TOKEN_EXPIRED")
	ErrForbidden             = errors.New("FORBIDDEN")
	ErrUserNotFound          = errors.New("USER_NOT_FOUND")
	ErrInvalidCurrentPassword = errors.New("INVALID_CURRENT_PASSWORD")
	ErrSamePassword          = errors.New("SAME_PASSWORD")
	ErrCannotChangeOwnRole   = errors.New("CANNOT_CHANGE_OWN_ROLE")
	ErrValidation            = errors.New("VALIDATION_ERROR")
)
