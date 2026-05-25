import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateTeam,
  useDeleteTeam,
  useUpdateTeam,
} from '../hooks/useTeams';
import type { AdminUser, Team } from '../schemas';

interface Props {
  open: boolean;
  /** undefined = create */
  target?: Team;
  /** create 시 부모 팀 id (옵션). edit 시에는 무시. */
  parentTeamId?: number | null;
  users: AdminUser[];
  onClose: () => void;
}

const NONE_VALUE = '__none__';

export function TeamEditDialog({
  open,
  target,
  parentTeamId,
  users,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const isEdit = !!target;
  const [name, setName] = useState(target?.name ?? '');
  const [leadId, setLeadId] = useState<number | null>(
    target?.teamLeadId ?? null,
  );
  const [hrId, setHrId] = useState<number | null>(
    target?.hrManagerId ?? null,
  );
  const [parentId, setParentId] = useState<number | null>(
    isEdit ? target?.parentTeamId ?? null : parentTeamId ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setName(target?.name ?? '');
    setLeadId(target?.teamLeadId ?? null);
    setHrId(target?.hrManagerId ?? null);
    setParentId(
      isEdit ? target?.parentTeamId ?? null : parentTeamId ?? null,
    );
  }, [open, target, isEdit, parentTeamId]);

  const createMu = useCreateTeam();
  const updateMu = useUpdateTeam();
  const deleteMu = useDeleteTeam();
  const pending = createMu.isPending || updateMu.isPending || deleteMu.isPending;

  const nameOk = name.trim().length > 0;
  const canSave = nameOk && !pending;

  const handleSubmit = async () => {
    if (!canSave) return;
    if (isEdit && target) {
      await updateMu.mutateAsync({
        id: target.id,
        name,
        parentSet: true,
        parentTeamId: parentId,
        leadSet: true,
        teamLeadId: leadId,
        hrSet: true,
        hrManagerId: hrId,
      });
    } else {
      await createMu.mutateAsync({
        name,
        parentTeamId: parentId,
        teamLeadId: leadId,
        hrManagerId: hrId,
      });
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!target) return;
    await deleteMu.mutateAsync(target.id);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="team-edit-dialog"
    >
      <DialogTitle>
        {isEdit
          ? `${t('common.edit')} — ${target?.name}`
          : t('admin.teams.add')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t('admin.teams.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            inputProps={{ 'data-testid': 'team-name' }}
          />
          <TextField
            select
            label={t('admin.teams.parent')}
            value={parentId == null ? NONE_VALUE : String(parentId)}
            onChange={(e) =>
              setParentId(
                e.target.value === NONE_VALUE ? null : Number(e.target.value),
              )
            }
            inputProps={{ 'data-testid': 'team-parent' }}
          >
            <MenuItem value={NONE_VALUE}>{t('admin.teams.none')}</MenuItem>
            {/* parent 후보: 자기 자신 제외 */}
            {/* TODO: 순환 차단 (자기 하위는 부모로 불가) — 본 sprint 는 단순화 */}
          </TextField>
          <TextField
            select
            label={t('admin.teams.lead')}
            value={leadId == null ? NONE_VALUE : String(leadId)}
            onChange={(e) =>
              setLeadId(
                e.target.value === NONE_VALUE ? null : Number(e.target.value),
              )
            }
            inputProps={{ 'data-testid': 'team-lead' }}
          >
            <MenuItem value={NONE_VALUE}>{t('admin.teams.none')}</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={String(u.id)}>
                {u.name} ({u.email})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('admin.teams.hrManager')}
            value={hrId == null ? NONE_VALUE : String(hrId)}
            onChange={(e) =>
              setHrId(
                e.target.value === NONE_VALUE ? null : Number(e.target.value),
              )
            }
            inputProps={{ 'data-testid': 'team-hr' }}
          >
            <MenuItem value={NONE_VALUE}>{t('admin.teams.none')}</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={String(u.id)}>
                {u.name} ({u.email})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        {isEdit && (
          <Button
            color="error"
            onClick={() => {
              void handleDelete();
            }}
            disabled={pending}
            data-testid="team-delete"
            sx={{ mr: 'auto' }}
          >
            {t('admin.teams.delete')}
          </Button>
        )}
        <Button onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSave}
          data-testid="team-save"
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
