package leave_test

import (
	"math/big"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// numericFromFloatTest / numericFloat — 테스트 helper.
// (production code 의 leave.numericFromFloat 와 동일 시맨틱, package internal 이라 사본.)
func numericFromFloatTest(v float64) pgtype.Numeric {
	rounded := leave.RoundHours(v)
	scaled := int64(rounded * 10)
	if rounded < 0 && float64(scaled)/10 != rounded {
		scaled--
	}
	return pgtype.Numeric{Int: big.NewInt(scaled), Exp: -1, Valid: true}
}

func numericFloat(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}
