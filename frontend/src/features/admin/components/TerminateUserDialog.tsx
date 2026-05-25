import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useTranslation } from 'react-i18next';
import { useTerminateUser } from '../hooks/useTerminateUser';

interface Props {
  open: boolean;
  userId: number;
  name: string;
  onClose: () => void;
}

/**
 * 사용자 퇴사 처리 확인 다이얼로그.
 *
 * 파괴 액션 — 1차 confirm 만 사용 (UX 안티-패턴 §남발 금지).
 * 본 다이얼로그가 그 1차 confirm 이므로 추가 prompt 없이 바로 mutation.
 */
export function TerminateUserDialog({ open, userId, name, onClose }: Props) {
  const { t } = useTranslation();
  const mutation = useTerminateUser((_res, _name) => {
    onClose();
  });

  const handleConfirm = () => {
    mutation.mutate({ userId, name });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      data-testid="terminate-user-dialog"
      aria-labelledby="terminate-user-dialog-title"
    >
      <DialogTitle id="terminate-user-dialog-title">
        {t('admin.users.terminate.title')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('admin.users.terminate.confirm', { name })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={mutation.isPending}
          data-testid="terminate-user-cancel"
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={mutation.isPending}
          data-testid="terminate-user-confirm"
        >
          {t('common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
