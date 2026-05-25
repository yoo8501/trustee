// verify-calendar — 모든 active user 의 calendar 응답에 DB 의 모든 holiday + approved
// LeaveRequest row 가 포함되는지 비교. 누락 1건이라도 발견 시 exit 1.
//
// 본 파일은 Red 단계 skeleton.
package main

import "errors"

// ErrCalendarMissing — 캘린더 응답에 expected row 가 누락된 경우.
var ErrCalendarMissing = errors.New("verify-calendar: missing events found")
