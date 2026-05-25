import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdjustLeaveBalance } from '../hooks/useLeaveTypes';
import { useLeaveTypesList } from '../hooks/useLeaveTypes';
import { useUsersList } from '../hooks/useUsersList';
import {
  AdjustLeaveBalanceSchema,
  type AdjustLeaveBalanceInput,
} from '../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * HR 강제 잔여 조정 다이얼로그.
 *
 * - 사용자 검색 select (autocomplete) + 휴가 종류 select + delta hours + reason.
 * - reason 빈칸 → 제출 버튼 disabled (UX §3 폼 단계 차단).
 * - 1차 confirm 후 즉시 mutation (confirm 다이얼로그 추가 X — 안티-패턴).
 */
export function LeaveBalanceAdjustDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { data: users } = useUsersList({ size: 200 });
  const { data: leaveTypes } = useLeaveTypesList();
  const mutation = useAdjustLeaveBalance();

  const [userId, setUserId] = useState<number | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState<number | null>(null);
  const [deltaHours, setDeltaHours] = useState<number>(0);
  const [reason, setReason] = useState('');

  const draft: Partial<AdjustLeaveBalanceInput> = {
    userId: userId ?? undefined,
    leaveTypeId: leaveTypeId ?? undefined,
    deltaHours,
    reason,
  };
  const parsed = AdjustLeaveBalanceSchema.safeParse(draft);
  const canSubmit = parsed.success && !mutation.isPending;

  const reset = () => {
    setUserId(null);
    setLeaveTypeId(null);
    setDeltaHours(0);
    setReason('');
  };

  const handleSubmit = async () => {
    if (!parsed.success) return;
    await mutation.mutateAsync(parsed.data);
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="leave-balance-adjust-dialog"
    >
      <DialogTitle>{t('admin.leaveBalance.adjust.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete
            options={users?.items ?? []}
            getOptionLabel={(u) => `${u.name} (${u.email})`}
            onChange={(_e, v) => setUserId(v?.id ?? null)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('admin.leaveBalance.adjust.user')}
                required
                inputProps={{
                  ...params.inputProps,
                  'data-testid': 'adjust-user',
                }}
              />
            )}
          />
          <TextField
            select
            label={t('admin.leaveBalance.adjust.leaveType')}
            value={leaveTypeId ?? ''}
            onChange={(e) => setLeaveTypeId(Number(e.target.value))}
            required
            inputProps={{ 'data-testid': 'adjust-leave-type' }}
          >
            {(leaveTypes?.items ?? []).map((lt) => (
              <MenuItem key={lt.id} value={lt.id}>
                {lt.name} ({lt.code})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('admin.leaveBalance.adjust.delta')}
            type="number"
            value={deltaHours}
            onChange={(e) => setDeltaHours(Number(e.target.value))}
            inputProps={{
              step: 0.5,
              'data-testid': 'adjust-delta',
            }}
            helperText="+ 또는 -"
          />
          <TextField
            label={t('admin.leaveBalance.adjust.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            multiline
            rows={3}
            inputProps={{ 'data-testid': 'adjust-reason' }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSubmit}
          data-testid="adjust-submit"
        >
          {t('admin.leaveBalance.adjust.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
