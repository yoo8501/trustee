import { z } from 'zod';

/**
 * Sprint 8 — Notification 도메인 Zod 스키마.
 *
 * BE:
 *   POST /api/hr/notifications/list           — 목록 (최근 50건 기본)
 *   POST /api/hr/notifications/:id/read       — 단건 read 처리
 *   POST /api/hr/notifications/read-all       — 전체 read
 *
 * type 은 BE enum (leave_submitted/leave_decided/attendance_auto_closed 등).
 * 새 type 이 추가돼도 FE 가 깨지지 않도록 string 으로 받아 i18n 키만 분기.
 */
export const NotificationSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  relatedUrl: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;
