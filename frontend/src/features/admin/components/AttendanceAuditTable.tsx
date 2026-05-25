import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttendanceAudit } from '../hooks/useAttendanceAudit';

const PAGE_SIZE = 20;

interface Filter {
  userId: string;
  from: string;
  to: string;
  source: '' | 'button' | 'manual_correction';
  clientIp: string;
}

const INITIAL: Filter = {
  userId: '',
  from: '',
  to: '',
  source: '',
  clientIp: '',
};

function fmtKstTime(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    });
  } catch {
    return iso;
  }
}

export function AttendanceAuditTable() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Filter>(INITIAL);
  const [applied, setApplied] = useState<Filter>(INITIAL);
  const [page, setPage] = useState(1);

  const params = {
    userId: applied.userId ? Number(applied.userId) : undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
    source: applied.source || undefined,
    clientIp: applied.clientIp || undefined,
    page,
    size: PAGE_SIZE,
  };
  const { data, isLoading, isError, isFetching } = useAttendanceAudit(params);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Stack spacing={2} data-testid="attendance-audit-table">
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'flex-end' } }}
      >
        <TextField
          size="small"
          label={t('admin.audit.attendance.filter.user')}
          value={draft.userId}
          onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
          inputProps={{ 'data-testid': 'audit-filter-user', inputMode: 'numeric' }}
        />
        <TextField
          size="small"
          type="date"
          label={t('admin.audit.attendance.filter.from')}
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          inputProps={{ 'data-testid': 'audit-filter-from' }}
        />
        <TextField
          size="small"
          type="date"
          label={t('admin.audit.attendance.filter.to')}
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          inputProps={{ 'data-testid': 'audit-filter-to' }}
        />
        <TextField
          select
          size="small"
          label={t('admin.audit.attendance.filter.source')}
          value={draft.source}
          onChange={(e) =>
            setDraft({ ...draft, source: e.target.value as Filter['source'] })
          }
          inputProps={{ 'data-testid': 'audit-filter-source' }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">
            {t('admin.audit.attendance.filter.source.all')}
          </MenuItem>
          <MenuItem value="button">
            {t('admin.audit.attendance.filter.source.button')}
          </MenuItem>
          <MenuItem value="manual_correction">
            {t('admin.audit.attendance.filter.source.manual')}
          </MenuItem>
        </TextField>
        <TextField
          size="small"
          label={t('admin.audit.attendance.filter.ip')}
          value={draft.clientIp}
          onChange={(e) => setDraft({ ...draft, clientIp: e.target.value })}
          inputProps={{ 'data-testid': 'audit-filter-ip' }}
        />
        <Button
          variant="contained"
          onClick={() => {
            setApplied(draft);
            setPage(1);
          }}
          data-testid="audit-search"
        >
          {t('admin.audit.attendance.search')}
        </Button>
      </Stack>

      {isLoading && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
          data-testid="audit-loading"
        >
          <CircularProgress size={24} />
        </Box>
      )}
      {isError && (
        <Alert severity="error" data-testid="audit-error">
          {t('admin.users.error')}
        </Alert>
      )}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <Alert severity="info" data-testid="audit-empty">
          {t('admin.audit.attendance.empty')}
        </Alert>
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <Box sx={{ position: 'relative' }}>
          {isFetching && (
            <Box
              sx={{ position: 'absolute', right: 8, top: 8 }}
              data-testid="audit-refetching"
            >
              <CircularProgress size={16} />
            </Box>
          )}
          <Table size="small" data-testid="audit-table">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.audit.attendance.col.date')}</TableCell>
                <TableCell>{t('admin.audit.attendance.col.user')}</TableCell>
                <TableCell>
                  {t('admin.audit.attendance.col.checkIn')}
                </TableCell>
                <TableCell>
                  {t('admin.audit.attendance.col.checkOut')}
                </TableCell>
                <TableCell>
                  {t('admin.audit.attendance.col.status')}
                </TableCell>
                <TableCell>
                  {t('admin.audit.attendance.col.source')}
                </TableCell>
                <TableCell>{t('admin.audit.attendance.col.ip')}</TableCell>
                <TableCell>{t('admin.audit.attendance.col.ua')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id} data-testid={`audit-row-${row.id}`}>
                  <TableCell>{row.workDate}</TableCell>
                  <TableCell>{row.userId}</TableCell>
                  <TableCell>{fmtKstTime(row.checkInAt)}</TableCell>
                  <TableCell>{fmtKstTime(row.checkOutAt)}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.clientIp || '-'}</TableCell>
                  <TableCell
                    sx={{
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.userAgent}
                  >
                    {row.userAgent || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {!isLoading && !isError && data && data.total > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            data-testid="audit-prev"
          >
            {t('admin.audit.attendance.page.prev')}
          </Button>
          <Typography variant="body2" data-testid="audit-page-info">
            {t('admin.audit.attendance.page.info', {
              page,
              total: totalPages,
            })}
          </Typography>
          <Button
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="audit-next"
          >
            {t('admin.audit.attendance.page.next')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
