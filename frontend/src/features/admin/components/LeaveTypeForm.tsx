import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateLeaveType,
  useUpdateLeaveType,
} from '../hooks/useLeaveTypes';
import type { AccrualPolicy, LeaveType } from '../schemas';
import { AccrualPolicyEditor } from './AccrualPolicyEditor';

interface Props {
  open: boolean;
  /** undefined = 새로 만들기, 객체 = 편집. */
  target?: LeaveType;
  onClose: () => void;
}

const DEFAULT_POLICY: AccrualPolicy = { type: 'fixed' };

/**
 * 휴가 종류 추가/편집 폼.
 *
 * - code 는 새로 만들 때만 입력 가능 (저장 후 disabled — 시스템 키).
 * - accrual_policy 는 JSON 편집기. 무효한 정책은 저장 차단 (Done When §3).
 */
export function LeaveTypeForm({ open, target, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!target;

  const [code, setCode] = useState(target?.code ?? '');
  const [name, setName] = useState(target?.name ?? '');
  const [defaultHours, setDefaultHours] = useState<number>(
    target?.defaultHours ?? 8,
  );
  const [isPaid, setIsPaid] = useState(target?.isPaid ?? true);
  const [isActive, setIsActive] = useState(target?.isActive ?? true);
  const [policy, setPolicy] = useState<AccrualPolicy>(
    target?.accrualPolicy ?? DEFAULT_POLICY,
  );
  const [policyValid, setPolicyValid] = useState(true);

  useEffect(() => {
    if (!open) return;
    setCode(target?.code ?? '');
    setName(target?.name ?? '');
    setDefaultHours(target?.defaultHours ?? 8);
    setIsPaid(target?.isPaid ?? true);
    setIsActive(target?.isActive ?? true);
    setPolicy(target?.accrualPolicy ?? DEFAULT_POLICY);
    setPolicyValid(true);
  }, [open, target]);

  const createMu = useCreateLeaveType();
  const updateMu = useUpdateLeaveType();
  const pending = createMu.isPending || updateMu.isPending;

  const codeOk = isEdit || code.trim().length > 0;
  const nameOk = name.trim().length > 0;
  const hoursOk = defaultHours > 0 && defaultHours <= 24;
  const canSave = codeOk && nameOk && hoursOk && policyValid && !pending;

  const handleSubmit = async () => {
    if (!canSave) return;
    if (isEdit && target) {
      await updateMu.mutateAsync({
        id: target.id,
        name,
        defaultHours,
        isPaid,
        isActive,
        accrualPolicy: policy,
      });
    } else {
      await createMu.mutateAsync({
        code,
        name,
        defaultHours,
        isPaid,
        isActive,
        accrualPolicy: policy,
      });
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="leave-type-form-dialog"
    >
      <DialogTitle>
        {isEdit
          ? `${t('common.edit')} — ${target?.name}`
          : t('admin.leaveTypes.add')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t('admin.leaveTypes.code')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isEdit}
            helperText={isEdit ? t('admin.leaveTypes.code.locked') : ' '}
            inputProps={{ 'data-testid': 'lt-code' }}
            required
          />
          <TextField
            label={t('admin.leaveTypes.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            inputProps={{ 'data-testid': 'lt-name' }}
          />
          <TextField
            label={t('admin.leaveTypes.defaultHours')}
            type="number"
            value={defaultHours}
            onChange={(e) => setDefaultHours(Number(e.target.value))}
            inputProps={{
              min: 0.5,
              max: 24,
              step: 0.5,
              'data-testid': 'lt-default-hours',
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isPaid}
                onChange={(_e, v) => setIsPaid(v)}
                inputProps={{
                  'aria-label': t('admin.leaveTypes.isPaid'),
                }}
              />
            }
            label={t('admin.leaveTypes.isPaid')}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isActive}
                onChange={(_e, v) => setIsActive(v)}
                inputProps={{
                  'aria-label': t('admin.leaveTypes.isActive'),
                }}
              />
            }
            label={t('admin.leaveTypes.isActive')}
          />
          <AccrualPolicyEditor
            value={policy}
            onChange={setPolicy}
            onValidityChange={setPolicyValid}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSave}
          data-testid="lt-save"
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
