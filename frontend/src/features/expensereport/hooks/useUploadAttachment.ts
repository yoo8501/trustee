import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api';
import { expenseReportApi } from '../api';
import type { AttachmentUpload } from '../schemas';

/**
 * 첨부 업로드 mutation — Sprint 7.
 *
 * 호출부 (AttachmentUploader) 에서 파일 검증 후 호출. 성공 시 attachmentUrl/mime
 * 을 폼 hidden 필드에 저장 + 미리보기 갱신.
 */
export function useUploadAttachment() {
  return useMutation<AttachmentUpload, ApiError, File>({
    mutationFn: (file) => expenseReportApi.uploadAttachment(file),
  });
}
