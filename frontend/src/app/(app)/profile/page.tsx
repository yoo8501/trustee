'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Divider,
  Avatar,
  Chip,
  Stack,
  Snackbar,
  Alert,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import { useMe } from '@/hooks/useAuth';
import { useUpdateMe } from '@/hooks/useUsers';
import ChangePasswordForm from '@/components/users/ChangePasswordForm';

export default function ProfilePage() {
  const { data: user, isLoading } = useMe();
  const updateMe = useUpdateMe();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<{ name: string }>({
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (user) {
      reset({ name: user.name });
    }
  }, [user, reset]);

  const onSubmit = (data: { name: string }) => {
    updateMe.mutate(data, {
      onSuccess: () => {
        setSuccess(true);
        reset(data);
      },
    });
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={40} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={300} sx={{ mb: 3, borderRadius: 3 }} />
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 0.5 }}>
        내 정보
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        프로필 정보를 확인하고 수정합니다
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          기본 정보
        </Typography>
        <Divider sx={{ mb: 3 }} />

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Avatar
            sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: '1.5rem' }}
          >
            {user?.name?.charAt(0)}
          </Avatar>
          <Box>
            <Typography variant="subtitle2">{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={user?.role === 'admin' ? '관리자' : '일반 사용자'}
                size="small"
                color={user?.role === 'admin' ? 'primary' : 'default'}
              />
            </Box>
          </Box>
        </Stack>

        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextField
            {...register('name')}
            label="이름"
            fullWidth
            disabled={updateMe.isPending}
            sx={{ mb: 2.5 }}
          />

          <TextField
            label="이메일"
            value={user?.email || ''}
            fullWidth
            disabled
            sx={{ mb: 3 }}
          />

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={() => reset({ name: user?.name || '' })}
              disabled={!isDirty || updateMe.isPending}
              sx={{ borderRadius: 2 }}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!isDirty || updateMe.isPending}
              disableElevation
              sx={{ borderRadius: 2 }}
            >
              {updateMe.isPending ? <CircularProgress size={24} color="inherit" /> : '저장'}
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          비밀번호 변경
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <ChangePasswordForm />
      </Paper>

      <Snackbar
        open={success}
        autoHideDuration={4000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(false)}>
          프로필이 저장되었습니다
        </Alert>
      </Snackbar>
    </Box>
  );
}
