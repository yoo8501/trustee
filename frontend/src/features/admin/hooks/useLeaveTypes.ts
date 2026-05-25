import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import {
  leaveBalancesApi,
  leaveTypesApi,
  type AdjustResponse,
  type CreateLeaveTypeRequest,
  type UpdateLeaveTypeRequest,
} from '../api/leaveTypes';
import type { AdjustLeaveBalanceInput, LeaveType } from '../schemas';
import { leaveTypesKeys } from './keys';

export function useLeaveTypesList() {
  return useQuery<{ items: LeaveType[]; total: number }>({
    queryKey: leaveTypesKeys.list(),
    queryFn: () => leaveTypesApi.list({ size: 100 }),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useCreateLeaveType() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<LeaveType, ApiError, CreateLeaveTypeRequest>({
    mutationFn: (req) => leaveTypesApi.create(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveTypesKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}

export function useUpdateLeaveType() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<LeaveType, ApiError, UpdateLeaveTypeRequest>({
    mutationFn: (req) => leaveTypesApi.update(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveTypesKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}

export function useDeleteLeaveType() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<{ status: string }, ApiError, number>({
    mutationFn: (id) => leaveTypesApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveTypesKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}

/**
 * HR 강제 잔여 조정.
 *
 * 성공 toast = "잔여를 조정했어요".
 */
export function useAdjustLeaveBalance() {
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<AdjustResponse, ApiError, AdjustLeaveBalanceInput>({
    mutationFn: (req) => leaveBalancesApi.adjust(req),
    onSuccess: () => {
      enqueueSnackbar(t('admin.leaveBalance.adjust.success'), {
        variant: 'success',
      });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}
