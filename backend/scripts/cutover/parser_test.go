package main

import (
	"errors"
	"strings"
	"testing"
)

// ============================================================
// UserRow parser
// ============================================================

func TestParseUsersCSV_HappyPath(t *testing.T) {
	src := `email,name,team_name,manager_email,hire_date,role,work_start,work_end
alice@example.com,홍길동,개발팀,bob@example.com,2024-03-15,general,09:00,18:00
bob@example.com,김길순,개발팀,,2022-01-10,team_lead,09:00,18:00
`
	got, err := ParseUsersCSV(strings.NewReader(src))
	if err != nil {
		t.Fatalf("ParseUsersCSV: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].Email != "alice@example.com" {
		t.Errorf("row[0].Email = %q, want alice@example.com", got[0].Email)
	}
	if got[0].TeamName != "개발팀" {
		t.Errorf("row[0].TeamName = %q, want 개발팀", got[0].TeamName)
	}
	if got[0].HireDate != "2024-03-15" {
		t.Errorf("row[0].HireDate = %q", got[0].HireDate)
	}
	if got[1].ManagerEmail != "" {
		t.Errorf("row[1].ManagerEmail should be empty, got %q", got[1].ManagerEmail)
	}
	if got[1].Role != "team_lead" {
		t.Errorf("row[1].Role = %q", got[1].Role)
	}
}

func TestParseUsersCSV_Empty(t *testing.T) {
	src := `email,name,team_name,manager_email,hire_date,role,work_start,work_end
`
	_, err := ParseUsersCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVEmpty) {
		t.Fatalf("expected ErrCSVEmpty, got %v", err)
	}
}

func TestParseUsersCSV_MissingColumn(t *testing.T) {
	src := `email,name,team_name
alice@example.com,홍길동,개발팀
`
	_, err := ParseUsersCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVMissingColumn) {
		t.Fatalf("expected ErrCSVMissingColumn, got %v", err)
	}
}

func TestParseUsersCSV_InvalidRole(t *testing.T) {
	src := `email,name,team_name,manager_email,hire_date,role,work_start,work_end
alice@example.com,홍길동,개발팀,,2024-03-15,invalid_role,09:00,18:00
`
	_, err := ParseUsersCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow for invalid role, got %v", err)
	}
}

func TestParseUsersCSV_InvalidDate(t *testing.T) {
	src := `email,name,team_name,manager_email,hire_date,role,work_start,work_end
alice@example.com,홍길동,개발팀,,2024/03/15,general,09:00,18:00
`
	_, err := ParseUsersCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow for invalid date format, got %v", err)
	}
}

// ============================================================
// TeamRow parser
// ============================================================

func TestParseTeamsCSV_HappyPath(t *testing.T) {
	src := `name,parent_name,team_lead_email,hr_manager_email
개발팀,,bob@example.com,carol@example.com
HR팀,,,carol@example.com
`
	got, err := ParseTeamsCSV(strings.NewReader(src))
	if err != nil {
		t.Fatalf("ParseTeamsCSV: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].Name != "개발팀" {
		t.Errorf("row[0].Name = %q", got[0].Name)
	}
	if got[0].TeamLeadEmail != "bob@example.com" {
		t.Errorf("row[0].TeamLeadEmail = %q", got[0].TeamLeadEmail)
	}
}

func TestParseTeamsCSV_MissingColumn(t *testing.T) {
	src := `name,parent_name
개발팀,
`
	_, err := ParseTeamsCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVMissingColumn) {
		t.Fatalf("expected ErrCSVMissingColumn, got %v", err)
	}
}

// ============================================================
// BalanceRow parser
// ============================================================

func TestParseBalancesCSV_HappyPath(t *testing.T) {
	src := `user_email,leave_type_code,period_year,granted_hours,used_hours
alice@example.com,annual,2026,120.0,16.0
bob@example.com,annual,2026,144.0,40.0
`
	got, err := ParseBalancesCSV(strings.NewReader(src))
	if err != nil {
		t.Fatalf("ParseBalancesCSV: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].UserEmail != "alice@example.com" {
		t.Errorf("row[0].UserEmail = %q", got[0].UserEmail)
	}
	if got[0].LeaveTypeCode != "annual" {
		t.Errorf("row[0].LeaveTypeCode = %q", got[0].LeaveTypeCode)
	}
	if got[0].PeriodYear != 2026 {
		t.Errorf("row[0].PeriodYear = %d", got[0].PeriodYear)
	}
	if got[0].GrantedHours != 120.0 {
		t.Errorf("row[0].GrantedHours = %v", got[0].GrantedHours)
	}
	if got[1].UsedHours != 40.0 {
		t.Errorf("row[1].UsedHours = %v", got[1].UsedHours)
	}
}

func TestParseBalancesCSV_InvalidYear(t *testing.T) {
	src := `user_email,leave_type_code,period_year,granted_hours,used_hours
alice@example.com,annual,bad,120.0,16.0
`
	_, err := ParseBalancesCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow, got %v", err)
	}
}

func TestParseBalancesCSV_InvalidHours(t *testing.T) {
	src := `user_email,leave_type_code,period_year,granted_hours,used_hours
alice@example.com,annual,2026,not_a_number,16.0
`
	_, err := ParseBalancesCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow, got %v", err)
	}
}

func TestParseBalancesCSV_NegativeHours(t *testing.T) {
	src := `user_email,leave_type_code,period_year,granted_hours,used_hours
alice@example.com,annual,2026,-1.0,16.0
`
	_, err := ParseBalancesCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow for negative hours, got %v", err)
	}
}

// ============================================================
// HolidayRow parser
// ============================================================

func TestParseHolidaysCSV_HappyPath(t *testing.T) {
	src := `date,name
2026-01-01,신정
2026-03-01,삼일절
`
	got, err := ParseHolidaysCSV(strings.NewReader(src))
	if err != nil {
		t.Fatalf("ParseHolidaysCSV: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].Date != "2026-01-01" {
		t.Errorf("row[0].Date = %q", got[0].Date)
	}
	if got[0].Name != "신정" {
		t.Errorf("row[0].Name = %q", got[0].Name)
	}
}

func TestParseHolidaysCSV_InvalidDate(t *testing.T) {
	src := `date,name
not-a-date,bad
`
	_, err := ParseHolidaysCSV(strings.NewReader(src))
	if !errors.Is(err, ErrCSVInvalidRow) {
		t.Fatalf("expected ErrCSVInvalidRow, got %v", err)
	}
}

// ============================================================
// Verification — diff = 0 invariant
// ============================================================

func TestVerifyBalancesDiff_Zero(t *testing.T) {
	csv := []BalanceRow{
		{UserEmail: "a@x.com", LeaveTypeCode: "annual", PeriodYear: 2026, GrantedHours: 120, UsedHours: 16},
		{UserEmail: "b@x.com", LeaveTypeCode: "annual", PeriodYear: 2026, GrantedHours: 144, UsedHours: 40},
	}
	// DB sum 이 정확히 일치 → diff = 0.
	dbGranted := 120.0 + 144.0
	dbUsed := 16.0 + 40.0
	diff := VerifyBalancesDiff(csv, dbGranted, dbUsed)
	if diff != 0 {
		t.Errorf("diff = %v, want 0", diff)
	}
}

func TestVerifyBalancesDiff_Mismatch(t *testing.T) {
	csv := []BalanceRow{
		{UserEmail: "a@x.com", LeaveTypeCode: "annual", PeriodYear: 2026, GrantedHours: 120, UsedHours: 16},
	}
	// DB 는 1 시간 부족.
	dbGranted := 119.0
	dbUsed := 16.0
	diff := VerifyBalancesDiff(csv, dbGranted, dbUsed)
	if diff == 0 {
		t.Errorf("expected non-zero diff, got 0")
	}
}

func TestVerifyCountsDiff(t *testing.T) {
	tests := []struct {
		name     string
		csvCount int
		dbCount  int
		want     int
	}{
		{"equal", 10, 10, 0},
		{"db more", 10, 12, 2},
		{"csv more", 12, 10, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := VerifyCountsDiff(tt.csvCount, tt.dbCount)
			if got != tt.want {
				t.Errorf("VerifyCountsDiff(%d,%d) = %d, want %d", tt.csvCount, tt.dbCount, got, tt.want)
			}
		})
	}
}
