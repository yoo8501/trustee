import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useTranslation } from 'react-i18next';
import type { StatsPeriod } from '../stats-types';

interface PeriodTabsProps {
  value: StatsPeriod;
  onChange: (next: StatsPeriod) => void;
}

const PERIODS: StatsPeriod[] = ['day', 'week', 'month'];

/**
 * 통계 기간 선택 탭 (일/주/월).
 * DESIGN.md §일관성 — 항상 같은 위치, 같은 순서.
 *
 * MUI Tabs 의 onChange 는 (event, value) 시그니처를 쓴다.
 */
export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={value}
      onChange={(_e, next: StatsPeriod) => onChange(next)}
      aria-label={t('attendance.stats.title')}
      data-testid="period-tabs"
    >
      {PERIODS.map((p) => (
        <Tab
          key={p}
          value={p}
          label={t(`attendance.stats.period.${p}`)}
          data-testid={`period-tab-${p}`}
          id={`period-tab-${p}`}
        />
      ))}
    </Tabs>
  );
}
