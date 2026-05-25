// Package main — cutover import 스크립트 (Sprint 10).
//
// 외부 SaaS 에서 export 한 CSV 들을 PostgreSQL 로 import + 검증.
// 본 파일은 Red 단계 — 함수 시그니처만 정의. parser.go 구현은 green 단계에서 채운다.
package main

import (
	"errors"
)

// 파서 sentinel errors.
var (
	// ErrCSVEmpty — CSV header 만 있거나 완전 빈 파일.
	ErrCSVEmpty = errors.New("cutover: csv empty (no data rows)")
	// ErrCSVMissingColumn — 필수 컬럼 누락.
	ErrCSVMissingColumn = errors.New("cutover: csv missing required column")
	// ErrCSVInvalidRow — row 형식 오류 (숫자 파싱 실패 등).
	ErrCSVInvalidRow = errors.New("cutover: csv invalid row")
)
