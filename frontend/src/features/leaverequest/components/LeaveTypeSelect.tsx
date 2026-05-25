import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { LeaveType } from '../../admin';

interface LeaveTypeSelectProps {
  /** 선택 가능한 휴가 종류 (BE 의 isActive=true 만 전달). */
  leaveTypes: LeaveType[];
  value: number | null;
  onChange: (id: number, leaveType: LeaveType) => void;
  disabled?: boolean;
}

/**
 * 휴가 종류 선택 — 카드 그리드 패턴 (DESIGN.md wireframe).
 *
 * 선택된 카드는 accent 컬러 outline. 카드 라벨에 defaultHours 노출.
 */
export function LeaveTypeSelect({
  leaveTypes,
  value,
  onChange,
  disabled = false,
}: LeaveTypeSelectProps) {
  const { t } = useTranslation();
  return (
    <Box
      role="radiogroup"
      aria-label={t('leave.create.type')}
      data-testid="leave-type-select"
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
        },
        gap: 1.5,
      }}
    >
      {leaveTypes.map((lt) => {
        const selected = lt.id === value;
        return (
          <Box
            key={lt.id}
            role="radio"
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onChange(lt.id, lt)}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(lt.id, lt);
              }
            }}
            data-testid={`leave-type-option-${lt.code}`}
            sx={{
              border: '1.5px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'action.selected' : 'background.paper',
              borderRadius: 2,
              p: 1.5,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'border-color 120ms ease, background-color 120ms ease',
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 1,
              },
              '&:hover': {
                borderColor: disabled ? 'divider' : 'primary.main',
              },
            }}
          >
            <Typography
              variant="body2"
              fontWeight={600}
              color={selected ? 'primary.main' : 'text.primary'}
            >
              {lt.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.25 }}
            >
              {lt.defaultHours}h
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
