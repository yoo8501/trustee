import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useReadAll } from '../hooks/useReadAll';
import { useReadNotification } from '../hooks/useReadNotification';
import type { Notification } from '../schemas';

interface NotificationDropdownProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  notifications: Notification[];
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NotificationDropdown({
  open,
  anchorEl,
  onClose,
  notifications,
}: NotificationDropdownProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const readMut = useReadNotification();
  const readAllMut = useReadAll();

  const unread = notifications.filter((n) => n.readAt === null);

  const onClick = (n: Notification) => {
    if (n.readAt === null) {
      readMut.mutate(n.id);
    }
    onClose();
    if (n.relatedUrl !== null && n.relatedUrl.length > 0) {
      navigate(n.relatedUrl);
    }
  };

  const onReadAll = () => {
    readAllMut.mutate();
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: 320, sm: 360 },
            maxHeight: 480,
            overflow: 'auto',
          },
          'data-testid': 'notification-dropdown',
        },
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 2, py: 1.5 }}
      >
        <Typography variant="h3">{t('notification.dropdown.title')}</Typography>
        {unread.length > 0 && (
          <Button
            size="small"
            onClick={onReadAll}
            data-testid="notification-read-all"
          >
            {t('notification.dropdown.readAll')}
          </Button>
        )}
      </Stack>
      <Divider />
      {notifications.length === 0 ? (
        <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="notification-dropdown-empty"
          >
            {t('notification.dropdown.empty')}
          </Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {notifications.map((n) => {
            const unreadDot = n.readAt === null;
            return (
              <ListItemButton
                key={n.id}
                onClick={() => onClick(n)}
                data-testid={`notification-item-${n.id}`}
                data-unread={unreadDot ? 'true' : 'false'}
                sx={{
                  alignItems: 'flex-start',
                  py: 1,
                  bgcolor: unreadDot ? 'action.hover' : undefined,
                }}
              >
                {unreadDot && (
                  <Box
                    aria-label="unread"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'warning.main',
                      mt: 0.75,
                      mr: 1,
                      flexShrink: 0,
                    }}
                  />
                )}
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: unreadDot ? 600 : 400 }}
                    >
                      {n.title}
                    </Typography>
                  }
                  secondary={
                    <Stack spacing={0.25}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {n.body}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ display: 'block' }}
                      >
                        {formatRelative(n.createdAt)}
                      </Typography>
                    </Stack>
                  }
                />
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Popover>
  );
}
