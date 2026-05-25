import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { useCreateExpense } from '../hooks/useCreateExpense';
import {
  formatCommaInput,
  parseCurrency,
} from '../lib/formatCurrency';
import { expenseDraftStorage } from '../lib/draftStorage';
import {
  CreateExpenseSchema,
  type CreateExpenseInput,
} from '../schemas';
import { AttachmentUploader } from './AttachmentUploader';

/**
 * 지출결의서 신청 폼 — Sprint 7.
 *
 * UX §2 draft 24h / §3 폼 단계 차단 / §4 기본값 placeholder / §6 Cmd+Enter / §7 결과 토스트.
 *
 * 제출 disabled 조건:
 *  - 폼 invalid (RHF)
 *  - 제출 중
 */
function todayKstDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ExpenseForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const createMut = useCreateExpense();

  const defaults = useMemo<CreateExpenseInput>(
    () => ({
      amountWon: 0,
      vendor: '',
      purpose: '',
      paidAt: todayKstDate(),
      attachmentUrl: undefined,
      attachmentMime: undefined,
    }),
    [],
  );

  const draftLoadedRef = useRef(false);
  const draftAnnouncedRef = useRef(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CreateExpenseInput>({
    resolver: zodResolver(CreateExpenseSchema),
    mode: 'onChange',
    defaultValues: defaults,
  });

  // draft 복구 (마운트 1회)
  useEffect(() => {
    if (draftLoadedRef.current) return;
    const draft = expenseDraftStorage.load();
    if (draft) {
      reset({
        amountWon: draft.amountWon ?? 0,
        vendor: draft.vendor ?? '',
        purpose: draft.purpose ?? '',
        paidAt: draft.paidAt ?? defaults.paidAt,
        attachmentUrl: draft.attachmentUrl,
        attachmentMime: draft.attachmentMime,
      });
      if (!draftAnnouncedRef.current) {
        draftAnnouncedRef.current = true;
        enqueueSnackbar(t('expense.create.draftRestored'), { variant: 'info' });
      }
    }
    draftLoadedRef.current = true;
  }, [defaults, enqueueSnackbar, reset, t]);

  // debounce draft 저장
  const watched = watch();
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const handle = setTimeout(() => {
      expenseDraftStorage.save(watchedRef.current);
    }, 500);
    return () => clearTimeout(handle);
  }, [watched]);

  const blockedReason = !isValid
    ? t('expense.create.requirementHint')
    : '';

  const disabled = isSubmitting || !isValid;

  const [serverErrorCode, setServerErrorCode] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerErrorCode(null);
    try {
      const result = await createMut.mutateAsync(values);
      const successMsg = result.approverName
        ? t('expense.create.success', { approver: result.approverName })
        : t('expense.create.successWithoutApprover');
      enqueueSnackbar(successMsg, { variant: 'success' });
      navigate('/expense/my');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errorCode === 'VALIDATION_FAILED' && e.fields) {
          e.fields.forEach(({ field, reason }) => {
            setError(field as keyof CreateExpenseInput, {
              type: reason,
              message: reason,
            });
          });
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
    <Box>
      <Stack
        component="form"
        spacing={3}
        noValidate
        onSubmit={onSubmit}
        onKeyDown={handleKeyDown}
        data-testid="expense-form"
        aria-label={t('expense.create.title')}
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">{t('expense.create.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('expense.create.subtitle')}
          </Typography>
        </Stack>

        {serverErrorCode && (
          <Alert severity="error" data-testid="expense-form-server-error">
            {t(`error.${serverErrorCode}`, {
              defaultValue: t('error.unknown'),
            })}
          </Alert>
        )}

        <Controller
          name="amountWon"
          control={control}
          render={({ field }) => (
            <TextField
              label={t('expense.create.amount')}
              fullWidth
              inputMode="numeric"
              autoComplete="off"
              value={formatCommaInput(field.value || 0)}
              onChange={(e) => {
                const next = parseCurrency(e.target.value);
                field.onChange(next);
              }}
              error={!!errors.amountWon}
              helperText={
                errors.amountWon
                  ? t('error.field.amountWon.positive')
                  : t('expense.create.amount.hint')
              }
              placeholder="0"
              data-testid="expense-form-amount"
              slotProps={{
                input: { endAdornment: <Typography variant="body2">원</Typography> },
              }}
            />
          )}
        />

        <TextField
          label={t('expense.create.vendor')}
          fullWidth
          placeholder={t('expense.create.vendor.placeholder')}
          {...register('vendor')}
          error={!!errors.vendor}
          helperText={errors.vendor ? t('error.field.vendor.required') : ' '}
          data-testid="expense-form-vendor"
        />

        <TextField
          label={t('expense.create.purpose')}
          multiline
          minRows={2}
          fullWidth
          placeholder={t('expense.create.purpose.placeholder')}
          {...register('purpose')}
          error={!!errors.purpose}
          helperText={errors.purpose ? t('error.field.purpose.required') : ' '}
          data-testid="expense-form-purpose"
        />

        <Controller
          name="paidAt"
          control={control}
          render={({ field }) => (
            <TextField
              label={t('expense.create.paidAt')}
              type="date"
              fullWidth
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              error={!!errors.paidAt}
              slotProps={{ inputLabel: { shrink: true } }}
              data-testid="expense-form-paidAt"
            />
          )}
        />

        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            {t('expense.create.attachment')}
          </Typography>
          <Controller
            name="attachmentUrl"
            control={control}
            render={({ field: urlField }) => (
              <Controller
                name="attachmentMime"
                control={control}
                render={({ field: mimeField }) => (
                  <AttachmentUploader
                    attachmentUrl={urlField.value}
                    attachmentMime={mimeField.value}
                    onChange={(info) => {
                      if (info === null) {
                        urlField.onChange(undefined);
                        mimeField.onChange(undefined);
                      } else {
                        urlField.onChange(info.url);
                        mimeField.onChange(info.mime);
                      }
                    }}
                  />
                )}
              />
            )}
          />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={disabled}
            data-testid="expense-form-submit"
          >
            {t('expense.create.submit')}
          </Button>
          {blockedReason && (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="expense-form-blocked-reason"
            >
              {blockedReason}
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" color="text.disabled">
          {t('expense.create.shortcut')}
        </Typography>
      </Stack>
    </Box>
  );
}
