import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationDropdown } from './NotificationDropdown';

interface NotificationBellProps {
  enabled?: boolean;
}

/**
 * 헤더 종 아이콘. 미읽음 카운트 badge + 드롭다운.
 *
 * 인증된 사용자만 노출 (`enabled` 가드).
 */
export function NotificationBell({ enabled = true }: NotificationBellProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const { data } = useNotifications({ enabled });
  const notifications = data ?? [];
  const unread = notifications.filter((n) => n.readAt === null).length;

  return (
    <>
      <IconButton
        ref={buttonRef}
        onClick={() => setOpen(true)}
        aria-label={t('notification.bell')}
        data-testid="notification-bell"
        size="small"
      >
        <Badge
          badgeContent={unread}
          color="warning"
          max={99}
          data-testid="notification-bell-badge"
        >
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <NotificationDropdown
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        notifications={notifications}
      />
    </>
  );
}
