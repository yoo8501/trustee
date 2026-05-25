package leave

import (
	"math/big"

	"github.com/jackc/pgx/v5/pgtype"
)

// numericFromFloat — float64 → pgtype.Numeric (NUMERIC(6,1) / NUMERIC(4,1) 호환).
// 정밀도 손실 방지를 위해 0.1 단위 반올림 후 정수 *10 형태로 표현한다.
func numericFromFloat(v float64) pgtype.Numeric {
	rounded := RoundHours(v)
	// rounded * 10 → 정수.
	scaled := int64(rounded * 10)
	if rounded < 0 && float64(scaled)/10 != rounded {
		scaled--
	}
	return pgtype.Numeric{
		Int:   big.NewInt(scaled),
		Exp:   -1,
		Valid: true,
	}
}

// numericToFloat — pgtype.Numeric → float64. 본 도메인 값(시간 수천h 이하)에선 손실 없음.
func numericToFloat(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err == nil && f.Valid {
		return f.Float64
	}
	return 0
}
