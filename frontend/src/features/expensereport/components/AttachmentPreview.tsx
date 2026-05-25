import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/**
 * 첨부 미리보기 — Sprint 7.
 *
 * - image/* → <img>
 * - application/pdf → 파일명 + 다운로드 링크 (인라인 PDF 임베드는 다크모드 대비 약함)
 * - 다른 mime → 다운로드 링크
 *
 * 다크 모드: background.paper 토큰 사용. 이미지 자체는 영향 없음.
 */
interface AttachmentPreviewProps {
  url: string;
  mime: string;
  /** 파일명 (대체 텍스트용). 기본은 url 마지막 segment. */
  filename?: string;
}

function basename(url: string): string {
  try {
    const parts = url.split('/');
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

export function AttachmentPreview({
  url,
  mime,
  filename,
}: AttachmentPreviewProps) {
  const { t } = useTranslation();
  const name = filename ?? basename(url);

  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  return (
    <Box
      data-testid="attachment-preview"
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
      }}
    >
      {isImage && (
        <Box
          component="img"
          src={url}
          alt={name}
          data-testid="attachment-preview-image"
          sx={{
            maxWidth: '100%',
            maxHeight: 240,
            borderRadius: 1,
            display: 'block',
          }}
        />
      )}
      {!isImage && (
        <Stack spacing={0.5} data-testid="attachment-preview-file">
          <Typography variant="body2" color="text.primary">
            {isPdf ? 'PDF' : mime} · {name}
          </Typography>
          <Link
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="attachment-preview-download"
          >
            {t('expense.attachment.preview')}
          </Link>
        </Stack>
      )}
    </Box>
  );
}
