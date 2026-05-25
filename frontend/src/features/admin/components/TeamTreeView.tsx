import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeamsList } from '../hooks/useTeams';
import type { AdminUser, Team } from '../schemas';
import { TeamEditDialog } from './TeamEditDialog';

interface TreeNode {
  team: Team;
  children: TreeNode[];
  depth: number;
}

function buildForest(teams: Team[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  teams.forEach((t) =>
    map.set(t.id, { team: t, children: [], depth: 0 }),
  );
  const roots: TreeNode[] = [];
  teams.forEach((t) => {
    const node = map.get(t.id);
    if (!node) return;
    if (t.parentTeamId != null && map.has(t.parentTeamId)) {
      const parent = map.get(t.parentTeamId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // depth 계산 (DFS)
  const setDepth = (node: TreeNode, d: number) => {
    node.depth = d;
    node.children.forEach((c) => setDepth(c, d + 1));
  };
  roots.forEach((r) => setDepth(r, 0));
  return roots;
}

interface Props {
  /**
   * 팀장 / HR 매니저 select 옵션용. 부모에서 useUsersList 로 fetch 한 items 를 넘긴다.
   */
  users: AdminUser[];
}

/**
 * 자체 재귀 트리 뷰 (MUI X TreeView 의존성 회피).
 *
 * 각 노드: 팀 이름 + 팀장 / HR 매니저 표시 + 액션 (수정 / 삭제 / 하위 추가).
 */
export function TeamTreeView({ users }: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useTeamsList();
  const [editing, setEditing] = useState<
    { mode: 'create'; parent: Team | null } | { mode: 'edit'; team: Team } | null
  >(null);

  const forest = useMemo(
    () => buildForest(data?.items ?? []),
    [data?.items],
  );

  if (isLoading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
        data-testid="teams-loading"
      >
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (isError) {
    return (
      <Alert severity="error" data-testid="teams-error">
        {t('admin.users.error')}
      </Alert>
    );
  }
  if (forest.length === 0) {
    return (
      <Stack spacing={2} data-testid="teams-empty">
        <Alert severity="info">{t('admin.teams.empty')}</Alert>
        <Button
          variant="contained"
          onClick={() => setEditing({ mode: 'create', parent: null })}
          data-testid="teams-add-root"
        >
          {t('admin.teams.add')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="outlined"
          onClick={() => setEditing({ mode: 'create', parent: null })}
          data-testid="teams-add-root"
        >
          {t('admin.teams.add')}
        </Button>
      </Stack>

      <Box
        component="ul"
        sx={{ listStyle: 'none', p: 0, m: 0 }}
        data-testid="team-tree"
      >
        {forest.map((node) => (
          <TreeRow
            key={node.team.id}
            node={node}
            users={users}
            onAddChild={(parent) =>
              setEditing({ mode: 'create', parent })
            }
            onEdit={(team) => setEditing({ mode: 'edit', team })}
          />
        ))}
      </Box>

      {editing && (
        <TeamEditDialog
          open
          target={editing.mode === 'edit' ? editing.team : undefined}
          parentTeamId={
            editing.mode === 'create' ? editing.parent?.id ?? null : undefined
          }
          users={users}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

interface TreeRowProps {
  node: TreeNode;
  users: AdminUser[];
  onAddChild: (parent: Team) => void;
  onEdit: (team: Team) => void;
}

function TreeRow({ node, users, onAddChild, onEdit }: TreeRowProps) {
  const { t } = useTranslation();
  const lead = users.find((u) => u.id === node.team.teamLeadId);
  const hr = users.find((u) => u.id === node.team.hrManagerId);

  return (
    <Box
      component="li"
      data-testid={`team-node-${node.team.id}`}
      sx={{ pl: node.depth * 3 }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {node.team.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('admin.teams.lead')}:{' '}
            {lead ? lead.name : t('admin.teams.none')} ·{' '}
            {t('admin.teams.hrManager')}:{' '}
            {hr ? hr.name : t('admin.teams.none')}
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={() => onAddChild(node.team)}
          data-testid={`team-add-child-${node.team.id}`}
          aria-label={t('admin.teams.addChild')}
        >
          ＋
        </IconButton>
        <Button
          size="small"
          onClick={() => onEdit(node.team)}
          data-testid={`team-edit-${node.team.id}`}
        >
          {t('admin.teams.edit')}
        </Button>
      </Stack>
      {node.children.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {node.children.map((c) => (
            <TreeRow
              key={c.team.id}
              node={c}
              users={users}
              onAddChild={onAddChild}
              onEdit={onEdit}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
