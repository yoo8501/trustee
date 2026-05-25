import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { useUploadAttachment } from '../hooks/useUploadAttachment';
import { AttachmentPreview } from './AttachmentPreview';

/**
 * 첨부 업로더 — Sprint 7.
 *
 * - HTML5 drag-drop + 클릭 업로드
 * - 10MB 검증 (서버는 백업)
 * - mime: image/*, application/pdf 만 허용
 * - 업로드 성공 시 부모에 URL/MIME 전달 + 미리보기 노출
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/*,application/pdf';

interface AttachmentUploaderProps {
  attachmentUrl?: string;
  attachmentMime?: string;
  onChange: (
    args: { url: string; mime: string; filename: string } | null,
  ) => void;
}

function isAcceptedMime(mime: string): boolean {
  if (mime.startsWith('image/')) return true;
  if (mime === 'application/pdf') return true;
  return false;
}

export function AttachmentUploader({
  attachmentUrl,
  attachmentMime,
  onChange,
}: AttachmentUploaderProps) {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadMut = useUploadAttachment();
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastFilename, setLastFilename] = useState<string | undefined>(
    undefined,
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = files instanceof FileList ? files.item(0) : files[0];
      if (!file) return;

      if (!isAcceptedMime(file.type)) {
        enqueueSnackbar(t('expense.attachment.invalidMime'), {
          variant: 'error',
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        enqueueSnackbar(t('expense.attachment.oversize'), {
          variant: 'error',
        });
        return;
      }

      uploadMut.mutate(file, {
        onSuccess: (data) => {
          setLastFilename(file.name);
          onChange({
            url: data.attachmentUrl,
            mime: data.attachmentMime,
            filename: file.name,
          });
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
          } else {
            enqueueSnackbar(t('common.error'), { variant: 'error' });
          }
        },
      });
    },
    [enqueueSnackbar, onChange, t, uploadMut],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onPick = () => {
    inputRef.current?.click();
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // 같은 파일을 다시 선택해도 onChange 가 발화하게 reset
    e.target.value = '';
  };

  const onRemove = () => {
    setLastFilename(undefined);
    onChange(null);
  };

  return (
    <Stack spacing={1.5} data-testid="attachment-uploader">
      <Box
        data-testid="attachment-dropzone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onPick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick();
          }
        }}
        aria-label={t('expense.attachment.drop')}
        sx={{
          border: '2px dashed',
          borderColor: isDragOver ? 'primary.main' : 'divider',
          bgcolor: isDragOver ? 'action.hover' : 'background.paper',
          borderRadius: 1,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background-color 0.15s',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="body2" color="text.primary">
            {t('expense.attachment.drop')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('expense.attachment.click')}
          </Typography>
        </Stack>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={onInputChange}
          data-testid="attachment-input"
        />
      </Box>

      {uploadMut.isPending && (
        <LinearProgress data-testid="attachment-progress" />
      )}

      {attachmentUrl && attachmentMime && (
        <Stack spacing={1}>
          <AttachmentPreview
            url={attachmentUrl}
            mime={attachmentMime}
            filename={lastFilename}
          />
          <Button
            size="small"
            color="inherit"
            onClick={onRemove}
            data-testid="attachment-remove"
          >
            {t('common.delete')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
