// Package main — cutover import 스크립트 (Sprint 10).
//
// 외부 SaaS 에서 export 한 CSV 들을 PostgreSQL 로 import + 검증.
//
// 본 파일은 CSV 파서 + 검증 헬퍼만 담는다 (DB 접속은 main.go 가 담당).
// 단순한 헬퍼들이라 unit test 로 전부 커버한다 (DB 의존 없음).
package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"
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

// 허용 role enum (permission.Role 과 동일하지만 의존성 차단을 위해 string 그대로).
var validRoles = map[string]bool{
	"general":     true,
	"team_lead":   true,
	"dept_head":   true,
	"hr_manager":  true,
	"super_admin": true,
}

// ============================================================
// User
// ============================================================

// UserRow — users.csv 한 줄.
type UserRow struct {
	Email        string
	Name         string
	TeamName     string
	ManagerEmail string
	HireDate     string // YYYY-MM-DD
	Role         string
	WorkStart    string // HH:MM
	WorkEnd      string // HH:MM
}

var userRequiredCols = []string{
	"email", "name", "team_name", "manager_email", "hire_date", "role", "work_start", "work_end",
}

// ParseUsersCSV — users.csv → []UserRow.
func ParseUsersCSV(r io.Reader) ([]UserRow, error) {
	idx, rows, err := readCSV(r, userRequiredCols)
	if err != nil {
		return nil, err
	}
	out := make([]UserRow, 0, len(rows))
	for i, row := range rows {
		u := UserRow{
			Email:        strings.TrimSpace(row[idx["email"]]),
			Name:         strings.TrimSpace(row[idx["name"]]),
			TeamName:     strings.TrimSpace(row[idx["team_name"]]),
			ManagerEmail: strings.TrimSpace(row[idx["manager_email"]]),
			HireDate:     strings.TrimSpace(row[idx["hire_date"]]),
			Role:         strings.TrimSpace(row[idx["role"]]),
			WorkStart:    strings.TrimSpace(row[idx["work_start"]]),
			WorkEnd:      strings.TrimSpace(row[idx["work_end"]]),
		}
		if u.Email == "" || u.Name == "" {
			return nil, fmt.Errorf("%w: row %d email/name empty", ErrCSVInvalidRow, i+2)
		}
		if !validRoles[u.Role] {
			return nil, fmt.Errorf("%w: row %d invalid role %q", ErrCSVInvalidRow, i+2, u.Role)
		}
		if _, err := time.Parse("2006-01-02", u.HireDate); err != nil {
			return nil, fmt.Errorf("%w: row %d hire_date %q: %v", ErrCSVInvalidRow, i+2, u.HireDate, err)
		}
		if u.WorkStart != "" {
			if _, err := time.Parse("15:04", u.WorkStart); err != nil {
				return nil, fmt.Errorf("%w: row %d work_start %q", ErrCSVInvalidRow, i+2, u.WorkStart)
			}
		}
		if u.WorkEnd != "" {
			if _, err := time.Parse("15:04", u.WorkEnd); err != nil {
				return nil, fmt.Errorf("%w: row %d work_end %q", ErrCSVInvalidRow, i+2, u.WorkEnd)
			}
		}
		out = append(out, u)
	}
	return out, nil
}

// ============================================================
// Team
// ============================================================

// TeamRow — teams.csv 한 줄.
type TeamRow struct {
	Name           string
	ParentName     string
	TeamLeadEmail  string
	HRManagerEmail string
}

var teamRequiredCols = []string{"name", "parent_name", "team_lead_email", "hr_manager_email"}

// ParseTeamsCSV — teams.csv → []TeamRow.
func ParseTeamsCSV(r io.Reader) ([]TeamRow, error) {
	idx, rows, err := readCSV(r, teamRequiredCols)
	if err != nil {
		return nil, err
	}
	out := make([]TeamRow, 0, len(rows))
	for i, row := range rows {
		t := TeamRow{
			Name:           strings.TrimSpace(row[idx["name"]]),
			ParentName:     strings.TrimSpace(row[idx["parent_name"]]),
			TeamLeadEmail:  strings.TrimSpace(row[idx["team_lead_email"]]),
			HRManagerEmail: strings.TrimSpace(row[idx["hr_manager_email"]]),
		}
		if t.Name == "" {
			return nil, fmt.Errorf("%w: row %d name empty", ErrCSVInvalidRow, i+2)
		}
		out = append(out, t)
	}
	return out, nil
}

// ============================================================
// Balance
// ============================================================

// BalanceRow — balances.csv 한 줄.
type BalanceRow struct {
	UserEmail     string
	LeaveTypeCode string
	PeriodYear    int
	GrantedHours  float64
	UsedHours     float64
}

var balanceRequiredCols = []string{
	"user_email", "leave_type_code", "period_year", "granted_hours", "used_hours",
}

// ParseBalancesCSV — balances.csv → []BalanceRow.
func ParseBalancesCSV(r io.Reader) ([]BalanceRow, error) {
	idx, rows, err := readCSV(r, balanceRequiredCols)
	if err != nil {
		return nil, err
	}
	out := make([]BalanceRow, 0, len(rows))
	for i, row := range rows {
		b := BalanceRow{
			UserEmail:     strings.TrimSpace(row[idx["user_email"]]),
			LeaveTypeCode: strings.TrimSpace(row[idx["leave_type_code"]]),
		}
		if b.UserEmail == "" || b.LeaveTypeCode == "" {
			return nil, fmt.Errorf("%w: row %d user_email/leave_type_code empty", ErrCSVInvalidRow, i+2)
		}
		yearStr := strings.TrimSpace(row[idx["period_year"]])
		y, err := strconv.Atoi(yearStr)
		if err != nil {
			return nil, fmt.Errorf("%w: row %d period_year %q: %v", ErrCSVInvalidRow, i+2, yearStr, err)
		}
		b.PeriodYear = y

		grantedStr := strings.TrimSpace(row[idx["granted_hours"]])
		g, err := strconv.ParseFloat(grantedStr, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: row %d granted_hours %q: %v", ErrCSVInvalidRow, i+2, grantedStr, err)
		}
		if g < 0 {
			return nil, fmt.Errorf("%w: row %d granted_hours negative (%v)", ErrCSVInvalidRow, i+2, g)
		}
		b.GrantedHours = g

		usedStr := strings.TrimSpace(row[idx["used_hours"]])
		u, err := strconv.ParseFloat(usedStr, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: row %d used_hours %q: %v", ErrCSVInvalidRow, i+2, usedStr, err)
		}
		if u < 0 {
			return nil, fmt.Errorf("%w: row %d used_hours negative (%v)", ErrCSVInvalidRow, i+2, u)
		}
		b.UsedHours = u

		out = append(out, b)
	}
	return out, nil
}

// ============================================================
// Holiday
// ============================================================

// HolidayRow — holidays.csv 한 줄.
type HolidayRow struct {
	Date string // YYYY-MM-DD
	Name string
}

var holidayRequiredCols = []string{"date", "name"}

// ParseHolidaysCSV — holidays.csv → []HolidayRow.
func ParseHolidaysCSV(r io.Reader) ([]HolidayRow, error) {
	idx, rows, err := readCSV(r, holidayRequiredCols)
	if err != nil {
		return nil, err
	}
	out := make([]HolidayRow, 0, len(rows))
	for i, row := range rows {
		h := HolidayRow{
			Date: strings.TrimSpace(row[idx["date"]]),
			Name: strings.TrimSpace(row[idx["name"]]),
		}
		if h.Name == "" {
			return nil, fmt.Errorf("%w: row %d name empty", ErrCSVInvalidRow, i+2)
		}
		if _, err := time.Parse("2006-01-02", h.Date); err != nil {
			return nil, fmt.Errorf("%w: row %d date %q: %v", ErrCSVInvalidRow, i+2, h.Date, err)
		}
		out = append(out, h)
	}
	return out, nil
}

// ============================================================
// 검증 헬퍼
// ============================================================

// VerifyCountsDiff — |csvCount - dbCount| 를 반환. 0 이면 일치.
func VerifyCountsDiff(csvCount, dbCount int) int {
	d := csvCount - dbCount
	if d < 0 {
		d = -d
	}
	return d
}

// VerifyBalancesDiff — CSV granted/used 합계 vs DB granted/used 합계 차이의 절대값 합.
// 0.05h (3분) 이내는 0 으로 본다 (numeric round 손실 보호).
func VerifyBalancesDiff(rows []BalanceRow, dbGranted, dbUsed float64) float64 {
	var csvG, csvU float64
	for _, r := range rows {
		csvG += r.GrantedHours
		csvU += r.UsedHours
	}
	diff := math.Abs(csvG-dbGranted) + math.Abs(csvU-dbUsed)
	if diff < 0.05 {
		return 0
	}
	return diff
}

// ============================================================
// 내부 — CSV 공통 reader
// ============================================================

// readCSV — header 검증 + 데이터 row slice 반환.
// idx 는 column name → index map. rows 는 데이터 row (header 제외).
func readCSV(r io.Reader, required []string) (map[string]int, [][]string, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	header, err := cr.Read()
	if err == io.EOF {
		return nil, nil, ErrCSVEmpty
	}
	if err != nil {
		return nil, nil, fmt.Errorf("cutover: csv header read: %w", err)
	}
	idx := map[string]int{}
	for i, col := range header {
		idx[strings.TrimSpace(col)] = i
	}
	for _, col := range required {
		if _, ok := idx[col]; !ok {
			return nil, nil, fmt.Errorf("%w: %s", ErrCSVMissingColumn, col)
		}
	}

	rows, err := cr.ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("cutover: csv read all: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil, ErrCSVEmpty
	}
	return idx, rows, nil
}
