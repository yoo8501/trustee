package auth_test

import (
	"testing"

	"github.com/sjseo/docflow/backend/internal/auth"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := auth.HashPassword("Sup3rSecret!")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("hash empty")
	}
	if !auth.VerifyPassword(hash, "Sup3rSecret!") {
		t.Fatal("VerifyPassword should succeed with correct password")
	}
	if auth.VerifyPassword(hash, "wrong-password") {
		t.Fatal("VerifyPassword should fail with wrong password")
	}
}

func TestHashPassword_EmptyRejected(t *testing.T) {
	_, err := auth.HashPassword("")
	if err == nil {
		t.Fatal("HashPassword(\"\") must error")
	}
}

func TestVerifyPassword_EmptyInputs(t *testing.T) {
	if auth.VerifyPassword("", "x") {
		t.Fatal("empty hash must fail")
	}
	if auth.VerifyPassword("$2a$12$abc", "") {
		t.Fatal("empty password must fail")
	}
}
