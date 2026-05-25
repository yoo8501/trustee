import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import {
  teamsApi,
  type CreateTeamRequest,
  type UpdateTeamRequest,
} from '../../teams/api/client';
import type { Team } from '../schemas';
import { teamsKeys } from './keys';

export function useTeamsList() {
  return useQuery<{ items: Team[]; total: number }>({
    queryKey: teamsKeys.list(),
    queryFn: () => teamsApi.list({ size: 200 }),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<Team, ApiError, CreateTeamRequest>({
    mutationFn: (req) => teamsApi.create(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<Team, ApiError, UpdateTeamRequest>({
    mutationFn: (req) => teamsApi.update(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  return useMutation<{ status: string }, ApiError, number>({
    mutationFn: (id) => teamsApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsKeys.all });
    },
    onError: (e) =>
      enqueueSnackbar(resolveErrorMessage(e, t), { variant: 'error' }),
  });
}
