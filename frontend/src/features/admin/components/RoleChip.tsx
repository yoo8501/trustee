import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';
import type { Role } from '../schemas';

interface Props {
  role: Role;
}

const COLOR_MAP: Record<Role, 'default' | 'primary' | 'secondary' | 'warning' | 'error'> = {
  general: 'default',
  team_lead: 'primary',
  dept_head: 'secondary',
  hr_manager: 'warning',
  super_admin: 'error',
};

export function RoleChip({ role }: Props) {
  const { t } = useTranslation();
  return (
    <Chip
      size="small"
      variant="outlined"
      color={COLOR_MAP[role]}
      label={t(`admin.role.${role}`)}
      data-testid={`role-chip-${role}`}
    />
  );
}
