import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { AttendanceAuditTable } from '../../features/admin';

export function AdminAttendanceAuditPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} data-testid="admin-audit-attendance-page">
      <Typography variant="h1">{t('admin.audit.attendance.title')}</Typography>
      <AttendanceAuditTable />
    </Stack>
  );
}
