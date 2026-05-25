import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { useLeaveTypesList, type LeaveType } from '../../admin';
import { useCreateLeaveRequest } from '../hooks/useCreateLeaveRequest';
import { useLeaveBalances } from '../hooks/useLeaveBalances';
import { useMyLeaveRequests } from '../hooks/useMyLeaveRequests';
import {
  CreateLeaveRequestSchema,
  type CreateLeaveRequestInput,
} from '../schemas';
import {
  checkDuplicate,
  collectExistingDates,
} from '../lib/checkDuplicate';
import { draftStorage } from '../lib/draftStorage';
import { nextBusinessDayRange } from '../lib/nextBusinessDay';
import { LeaveBalanceSidebar } from './LeaveBalanceSidebar';
import { LeaveTypeSelect } from './LeaveTypeSelect';

/**
 * 휴가 신청 폼 — Sprint 6 핵심.
 *
 * UX §2 draft 24h / §3 폼 단계 차단 / §4 기본값 다음 영업일 / §6 Cmd+Enter / §7 결과 토스트.
 *
 * 데이터:
 *  - 활성 휴가 종류: `useLeaveTypesList` (admin api, 인증된 모두 호출 가능)
 *  - 잔여: `useLeaveBalances`
 *  - 기존 신청 (중복 검사): `useMyLeaveRequests`
 *
 * 제출 disabled 조건:
 *  - 폼 invalid (RHF)
 *  - 선택 휴가 종류의 잔여 부족
 *  - 같은 날짜 중복
 *  - 제출 중
 */
function toIsoLocalInput(iso: string): string {
  // datetime-local 입력값 변환 — "YYYY-MM-DDTHH:mm"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

interface LeaveRequestFormProps {
  /** 테스트 / 스토리북 용 — 다음 영업일 계산에 쓰일 휴일 목록. */
  holidays?: ReadonlyArray<string>;
}

export function LeaveRequestForm({ holidays = [] }: LeaveRequestFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const leaveTypesQ = useLeaveTypesList();
  const balancesQ = useLeaveBalances();
  const myListQ = useMyLeaveRequests();
  const createMut = useCreateLeaveRequest();

  const activeLeaveTypes = useMemo<LeaveType[]>(
    () => (leaveTypesQ.data?.items ?? []).filter((lt) => lt.isActive),
    [leaveTypesQ.data?.items],
  );

  // 기본값 — 다음 영업일, 8시간, 가장 첫 활성 휴가 종류 (보통 연차).
  const defaults = useMemo<CreateLeaveRequestInput>(() => {
    const range = nextBusinessDayRange(new Date(), holidays);
    return {
      leaveTypeId: 0,
      startAt: range.startAt,
      endAt: range.endAt,
      hours: 8,
      reason: undefined,
    };
  }, [holidays]);

  const draftLoadedRef = useRef(false);
  const draftRestoredAnnouncedRef = useRef(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CreateLeaveRequestInput>({
    resolver: zodResolver(CreateLeaveRequestSchema),
    mode: 'onChange',
    defaultValues: defaults,
  });

  // 활성 타입 로드 후 leaveTypeId 기본값 결정 + draft 복구
  useEffect(() => {
    if (draftLoadedRef.current) return;
    if (activeLeaveTypes.length === 0) return;
    const draft = draftStorage.load();
    const fallbackTypeId = activeLeaveTypes[0]?.id ?? 0;
    if (draft) {
      reset({
        leaveTypeId: draft.leaveTypeId ?? fallbackTypeId,
        startAt: draft.startAt ?? defaults.startAt,
        endAt: draft.endAt ?? defaults.endAt,
        hours: draft.hours ?? 8,
        reason: draft.reason,
      });
      if (!draftRestoredAnnouncedRef.current) {
        draftRestoredAnnouncedRef.current = true;
        enqueueSnackbar(t('leave.create.draftRestored'), { variant: 'info' });
      }
    } else {
      setValue('leaveTypeId', fallbackTypeId, { shouldValidate: true });
    }
    draftLoadedRef.current = true;
  }, [activeLeaveTypes, defaults, enqueueSnackbar, reset, setValue, t]);

  // debounce draft 저장
  const watched = watch();
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const handle = setTimeout(() => {
      draftStorage.save(watchedRef.current);
    }, 500);
    return () => clearTimeout(handle);
  }, [watched]);

  // 잔여 부족 계산
  const selectedTypeId = watched.leaveTypeId;
  const selectedBalance = useMemo(
    () =>
      (balancesQ.data ?? []).find((b) => b.leaveTypeId === selectedTypeId) ??
      null,
    [balancesQ.data, selectedTypeId],
  );
  const requestedHours = watched.hours;
  const shortfall =
    selectedBalance && requestedHours > selectedBalance.remainingHours
      ? +(requestedHours - selectedBalance.remainingHours).toFixed(2)
      : 0;

  // 중복 검사
  const existingDates = useMemo(
    () => collectExistingDates(myListQ.data?.items ?? []),
    [myListQ.data?.items],
  );
  const duplicate = useMemo(
    () => checkDuplicate(watched.startAt, watched.endAt, existingDates),
    [watched.startAt, watched.endAt, existingDates],
  );

  const selectedLeaveTypeName =
    selectedBalance?.leaveTypeName ||
    activeLeaveTypes.find((lt) => lt.id === selectedTypeId)?.name ||
    '';

  const blockedReason = !isValid
    ? t('login.disabled.invalid', { defaultValue: '입력값을 확인해 주세요' })
    : shortfall > 0
    ? t('leave.create.insufficient', {
        leaveTypeName: selectedLeaveTypeName,
        hours: shortfall.toFixed(1),
      })
    : duplicate
    ? t('leave.create.duplicate')
    : '';

  const disabled =
    isSubmitting ||
    !isValid ||
    shortfall > 0 ||
    duplicate ||
    selectedTypeId === 0;

  const [serverErrorCode, setServerErrorCode] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerErrorCode(null);
    try {
      await createMut.mutateAsync(values);
      const approverName = selectedBalance?.leaveTypeName ? '' : '';
      // approver 자동 — sample 응답에 approverName 있으면 그것 사용. 여기선 단순 toast.
      const successMsg = approverName
        ? t('leave.create.success', { approver: approverName })
        : t('leave.create.successWithoutApprover');
      enqueueSnackbar(successMsg, { variant: 'success' });
      navigate('/leave/my');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errorCode === 'INSUFFICIENT_LEAVE_BALANCE') {
          setError('hours', { type: 'insufficient', message: 'insufficient' });
          setServerErrorCode('INSUFFICIENT_LEAVE_BALANCE');
          enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' });
          return;
        }
        if (e.errorCode === 'DUPLICATE_LEAVE_DATE') {
          setError('startAt', { type: 'duplicate', message: 'duplicate' });
          setServerErrorCode('DUPLICATE_LEAVE_DATE');
          enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' });
          return;
        }
        if (e.errorCode === 'INVALID_DATE_RANGE') {
          setError('endAt', { type: 'beforeStart', message: 'beforeStart' });
          setServerErrorCode('INVALID_DATE_RANGE');
          enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' });
          return;
        }
        setServerErrorCode(e.errorCode ?? null);
        enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' });
        return;
      }
      enqueueSnackbar(t('error.unknown'), { variant: 'error' });
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!disabled) void onSubmit(e);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 320px' },
        gap: 3,
      }}
    >
      <Stack
        component="form"
        spacing={3}
        noValidate
        onSubmit={onSubmit}
        onKeyDown={handleKeyDown}
        data-testid="leave-request-form"
        aria-label={t('leave.create.title')}
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">{t('leave.create.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('leave.create.subtitle')}
          </Typography>
        </Stack>

        {serverErrorCode && (
          <Alert severity="error" data-testid="leave-form-server-error">
            {t(`error.${serverErrorCode}`, {
              defaultValue: t('error.unknown'),
            })}
          </Alert>
        )}

        <Stack spacing={1}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="label"
          >
            {t('leave.create.type')}
          </Typography>
          <Controller
            name="leaveTypeId"
            control={control}
            render={({ field }) => (
              <LeaveTypeSelect
                leaveTypes={activeLeaveTypes}
                value={field.value || null}
                onChange={(id, lt) => {
                  field.onChange(id);
                  // 휴가 종류 선택 시 시간 자동 (반차/반반차 등)
                  setValue('hours', lt.defaultHours, { shouldValidate: true });
                }}
              />
            )}
          />
          {errors.leaveTypeId && (
            <FormHelperText error>
              {t('error.field.leaveTypeId.required')}
            </FormHelperText>
          )}
        </Stack>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems="flex-start"
        >
          <Controller
            name="startAt"
            control={control}
            render={({ field }) => (
              <TextField
                label={t('leave.create.startAt')}
                type="datetime-local"
                fullWidth
                value={field.value ? toIsoLocalInput(field.value) : ''}
                onChange={(e) => field.onChange(fromLocalInputToIso(e.target.value))}
                error={!!errors.startAt}
                slotProps={{ inputLabel: { shrink: true } }}
                data-testid="leave-form-startAt"
              />
            )}
          />
          <Controller
            name="endAt"
            control={control}
            render={({ field }) => (
              <TextField
                label={t('leave.create.endAt')}
                type="datetime-local"
                fullWidth
                value={field.value ? toIsoLocalInput(field.value) : ''}
                onChange={(e) => field.onChange(fromLocalInputToIso(e.target.value))}
                error={!!errors.endAt}
                helperText={
                  errors.endAt?.message === 'beforeStart'
                    ? t('error.field.endAt.beforeStart')
                    : ' '
                }
                slotProps={{ inputLabel: { shrink: true } }}
                data-testid="leave-form-endAt"
              />
            )}
          />
        </Stack>

        <TextField
          label={t('leave.create.hours')}
          type="number"
          inputMode="decimal"
          fullWidth
          slotProps={{
            htmlInput: { min: 0.5, max: 160, step: 0.5 },
          }}
          {...register('hours', { valueAsNumber: true })}
          error={!!errors.hours}
          helperText={
            errors.hours
              ? errors.hours.message === 'insufficient'
                ? t('error.INSUFFICIENT_LEAVE_BALANCE')
                : t('error.field.hours.required')
              : t('leave.create.hoursHint')
          }
          data-testid="leave-form-hours"
        />

        <TextField
          label={t('leave.create.reason')}
          placeholder={t('leave.create.reason.placeholder')}
          multiline
          minRows={2}
          fullWidth
          {...register('reason')}
          data-testid="leave-form-reason"
        />

        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={disabled}
            data-testid="leave-form-submit"
          >
            {t('leave.create.submit')}
          </Button>
          {blockedReason && (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="leave-form-blocked-reason"
            >
              {blockedReason}
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" color="text.disabled">
          {t('leave.create.shortcut')}
        </Typography>
      </Stack>

      <Box>
        <LeaveBalanceSidebar
          balances={balancesQ.data ?? []}
          highlightLeaveTypeId={selectedTypeId || null}
        />
      </Box>
    </Box>
  );
}
