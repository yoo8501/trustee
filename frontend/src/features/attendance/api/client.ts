import { http } from '../../../lib/api';
import { AttendanceRecordSchema, type AttendanceRecord } from '../types';

/**
 * Attendance API client.
 *
 * Sprint 4 — `check-in` / `check-out` 두 mutation + today fetch.
 *
 * Sprint 5 의 정식 단건/목록 endpoint 가 등장하기 전이므로 본 sprint 에서는
 * `POST /api/hr/attendance/me/today` 를 today 조회용으로 가정한다 (목록 = POST 규칙).
 * 응답은 null (오늘 record 없음) 혹은 단건 record.
 *
 * 모든 호출은 `lib/api/http.ts` 의 공통 client 경유 (CLAUDE.md §3.2).
 * BE 가 `null` 을 success.data 로 반환할 수 없으므로 (http 가 INVALID_RESPONSE 처리),
 * "기록 없음" 케이스는 `{ record: null }` wrapper 로 받는다.
 */

interface TodayWrapper {
  record: AttendanceRecord | null;
}

function parseRecord(raw: unknown): AttendanceRecord {
  const parsed = AttendanceRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid AttendanceRecord shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const attendanceApi = {
  /**
   * 오늘 출퇴근 기록 조회. 없으면 null.
   */
  async getToday(): Promise<AttendanceRecord | null> {
    const wrapper = await http.post<TodayWrapper>(
      '/api/hr/attendance/me/today',
    );
    if (wrapper.record === null) return null;
    return parseRecord(wrapper.record);
  },

  /**
   * 출근 체크.
   * BE 동작:
   *  - 첫 호출: 새 record 생성 (201)
   *  - 같은 날 두 번째 호출: 첫 record 그대로 반환 (200)
   */
  async checkIn(): Promise<AttendanceRecord> {
    const raw = await http.post<unknown>('/api/hr/attendance/check-in');
    return parseRecord(raw);
  },

  /**
   * 퇴근 체크.
   * BE 동작:
   *  - 출근 안 했으면 400 + `errorCode=CHECK_IN_REQUIRED`
   *  - 두 번째 호출: check_out_at 을 최신 시각으로 갱신
   */
  async checkOut(): Promise<AttendanceRecord> {
    const raw = await http.post<unknown>('/api/hr/attendance/check-out');
    return parseRecord(raw);
  },
};
