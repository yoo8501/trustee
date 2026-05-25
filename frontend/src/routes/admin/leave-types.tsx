import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LeaveBalanceAdjustDialog,
  LeaveTypeForm,
  useLeaveTypesList,
  type LeaveType,
} from '../../features/admin';

export function AdminLeaveTypesPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useLeaveTypesList();
  const [editing, setEditing] = useState<LeaveType | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <Stack spacing={3} data-testid="admin-leave-types-page">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
      >
        <Typography variant="h1">{t('admin.leaveTypes.title')}</Typography>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            onClick={() => setAdjustOpen(true)}
            data-testid="open-adjust-dialog"
          >
            {t('admin.leaveBalance.adjust.openButton')}
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreating(true)}
            data-testid="create-leave-type"
          >
            {t('admin.leaveTypes.add')}
          </Button>
        </Stack>
      </Stack>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {isError && (
        <Alert severity="error">{t('admin.users.error')}</Alert>
      )}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <Alert severity="info" data-testid="leave-types-empty">
          {t('admin.leaveTypes.empty')}
        </Alert>
      )}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <Table size="small" data-testid="leave-types-table">
          <TableHead>
            <TableRow>
              <TableCell>{t('admin.leaveTypes.code')}</TableCell>
              <TableCell>{t('admin.leaveTypes.name')}</TableCell>
              <TableCell>{t('admin.leaveTypes.defaultHours')}</TableCell>
              <TableCell>{t('admin.leaveTypes.policyType')}</TableCell>
              <TableCell>{t('admin.leaveTypes.isPaid')}</TableCell>
              <TableCell>{t('admin.leaveTypes.isActive')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.items.map((lt) => (
              <TableRow key={lt.id} data-testid={`leave-type-row-${lt.id}`}>
                <TableCell>{lt.code}</TableCell>
                <TableCell>{lt.name}</TableCell>
                <TableCell>{lt.defaultHours}</TableCell>
                <TableCell>{lt.accrualPolicy.type}</TableCell>
                <TableCell>{lt.isPaid ? 'Y' : 'N'}</TableCell>
                <TableCell>{lt.isActive ? 'Y' : 'N'}</TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    onClick={() => setEditing(lt)}
                    data-testid={`edit-leave-type-${lt.id}`}
                  >
                    {t('common.edit')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <LeaveTypeForm
        open={creating}
        onClose={() => setCreating(false)}
      />
      {editing && (
        <LeaveTypeForm
          open={!!editing}
          target={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      <LeaveBalanceAdjustDialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />
    </Stack>
  );
}
