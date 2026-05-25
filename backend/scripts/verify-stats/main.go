// verify-stats — 모든 active user 의 일/주/월 통계 합계 vs 원본 attendance_records 합계 비교.
//
// 본 파일은 Red 단계 skeleton. 실제 reconciler 구현은 green 단계에서 채운다.
package main

import "errors"

// ErrStatsMismatch — 한 건이라도 diff > 0 발견 시.
var ErrStatsMismatch = errors.New("verify-stats: mismatch found")
