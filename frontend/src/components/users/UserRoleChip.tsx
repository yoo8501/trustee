'use client';

import { Chip } from '@mui/material';

interface UserRoleChipProps {
  role: 'admin' | 'user';
}

export default function UserRoleChip({ role }: UserRoleChipProps) {
  return (
    <Chip
      label={role === 'admin' ? '관리자' : '일반 사용자'}
      size="small"
      color={role === 'admin' ? 'primary' : 'default'}
      variant={role === 'admin' ? 'filled' : 'outlined'}
    />
  );
}
