import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth';
import { useUpdateUser } from '../hooks/useUpdateUser';
import { useUsersList } from '../hooks/useUsersList';
import type { AdminUser, Role } from '../schemas';
import { RoleChip } from './RoleChip';
import { TerminateUserDialog } from './TerminateUserDialog';

const ROLES: Role[] = [
  'general',
  'team_lead',
  'dept_head',
  'hr_manager',
  'super_admin',
];

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * 사용자 검색 + 관리 테이블.
 *
 * Done When (Sprint 9):
 *  - 검색 (이름/이메일/팀) — 클라이언트 사이드 (소규모 가정).
 *  - role 변경 (super_admin only).
 *  - 본인 row → role 변경 disabled + tooltip.
 *  - terminate 버튼 → confirm 1차만.
 *  - 5 상태: Loading / Empty / Error / Success / Partial (검색 결과 0).
 */
export function UserSearchTable() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [terminateTarget, setTerminateTarget] = useState<AdminUser | null>(
    null,
  );
  const updateUser = useUpdateUser();

  const { data, isLoading, isError, isFetching } = useUsersList({
    page: 1,
    size: 100,
  });

  const filtered = useMemo<AdminUser[]>(() => {
    if (!data?.items) return [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((u) => {
      const teamStr = u.teamId == null ? '' : String(u.teamId);
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        teamStr.includes(q)
      );
    });
  }, [data?.items, debouncedSearch]);

  const isSuperAdmin = me?.role === 'super_admin';

  const handleRoleChange = (target: AdminUser, role: Role) => {
    updateUser.mutate({ id: target.id, role });
  };

  return (
    <Stack spacing={2} data-testid="user-search-table">
      <TextField
        size="small"
        placeholder={t('admin.users.search.placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          htmlInput: {
            'aria-label': t('admin.users.search.placeholder'),
            'data-testid': 'user-search-input',
          },
        }}
        fullWidth
      />

      {isLoading && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
          data-testid="user-list-loading"
        >
          <CircularProgress size={24} />
        </Box>
      )}

      {isError && (
        <Alert severity="error" data-testid="user-list-error">
          {t('admin.users.error')}
        </Alert>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Alert severity="info" data-testid="user-list-empty">
          {t('admin.users.empty')}
        </Alert>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <Box sx={{ position: 'relative' }}>
          {isFetching && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                p: 1,
              }}
              data-testid="user-list-refetching"
            >
              <CircularProgress size={16} />
            </Box>
          )}
          <Table size="small" data-testid="user-table">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.users.col.name')}</TableCell>
                <TableCell>{t('admin.users.col.email')}</TableCell>
                <TableCell>{t('admin.users.col.team')}</TableCell>
                <TableCell>{t('admin.users.col.role')}</TableCell>
                <TableCell>{t('admin.users.col.status')}</TableCell>
                <TableCell align="right">
                  {t('admin.users.col.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((u) => {
                const isSelf = me?.id === u.id;
                const roleSelectDisabled = !isSuperAdmin || isSelf;
                return (
                  <TableRow
                    key={u.id}
                    data-testid={`user-row-${u.id}`}
                    hover
                  >
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.teamId == null ? (
                        <Typography variant="body2" color="text.disabled">
                          {t('admin.teams.none')}
                        </Typography>
                      ) : (
                        u.teamId
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Tooltip
                          title={
                            isSelf
                              ? t('admin.users.role.self.tooltip')
                              : ''
                          }
                          disableHoverListener={!isSelf}
                        >
                          <span>
                            <Select
                              size="small"
                              value={u.role}
                              disabled={roleSelectDisabled}
                              onChange={(e) =>
                                handleRoleChange(u, e.target.value as Role)
                              }
                              inputProps={{
                                'data-testid': `role-select-${u.id}`,
                                'aria-label': t('admin.users.role.select'),
                              }}
                            >
                              {ROLES.map((r) => (
                                <MenuItem key={r} value={r}>
                                  {t(`admin.role.${r}`)}
                                </MenuItem>
                              ))}
                            </Select>
                          </span>
                        </Tooltip>
                      ) : (
                        <RoleChip role={u.role} />
                      )}
                    </TableCell>
                    <TableCell>{t(`admin.status.${u.status}`)}</TableCell>
                    <TableCell align="right">
                      {isSuperAdmin && (
                        <Tooltip
                          title={
                            isSelf
                              ? t('admin.users.terminate.self.tooltip')
                              : ''
                          }
                          disableHoverListener={!isSelf}
                        >
                          <span>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              disabled={isSelf || u.status === 'terminated'}
                              onClick={() => setTerminateTarget(u)}
                              data-testid={`terminate-btn-${u.id}`}
                            >
                              {t('admin.users.terminate.button')}
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {terminateTarget && (
        <TerminateUserDialog
          open={!!terminateTarget}
          userId={terminateTarget.id}
          name={terminateTarget.name}
          onClose={() => setTerminateTarget(null)}
        />
      )}
    </Stack>
  );
}
