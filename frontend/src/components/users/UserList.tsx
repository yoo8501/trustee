'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Box,
  Skeleton,
  Snackbar,
  Alert,
} from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import { useUsers, useUpdateUserRole } from '@/hooks/useUsers';
import { useMe } from '@/hooks/useAuth';
import UserRoleChip from './UserRoleChip';
import type { User } from '@/types/auth';

export default function UserList() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { data, isLoading } = useUsers(page + 1, rowsPerPage);
  const { data: currentUser } = useMe();
  const updateRole = useUpdateUserRole();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, user: User) => {
    setMenuAnchor(event.currentTarget);
    setSelectedUser(user);
  };

  const handleRoleChange = () => {
    if (!selectedUser) return;
    updateRole.mutate(
      { userId: selectedUser.id, data: { role: newRole } },
      {
        onSuccess: () => {
          setSnackbar({
            open: true,
            message: `${selectedUser.name}님의 역할이 변경되었습니다`,
            severity: 'success',
          });
          setRoleDialogOpen(false);
        },
        onError: () => {
          setSnackbar({
            open: true,
            message: '역할 변경에 실패했습니다',
            severity: 'error',
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>이름</TableCell>
              <TableCell>이메일</TableCell>
              <TableCell>역할</TableCell>
              <TableCell>가입일</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton width={120} /></TableCell>
                <TableCell><Skeleton width={180} /></TableCell>
                <TableCell><Skeleton width={80} /></TableCell>
                <TableCell><Skeleton width={100} /></TableCell>
                <TableCell><Skeleton width={40} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>이름</TableCell>
              <TableCell>이메일</TableCell>
              <TableCell>역할</TableCell>
              <TableCell>가입일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
                      {user.name.charAt(0)}
                    </Avatar>
                    <Typography variant="body2">{user.name}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {user.email}
                  </Typography>
                </TableCell>
                <TableCell>
                  <UserRoleChip role={user.role} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {user.id !== currentUser?.id && (
                    <IconButton
                      size="small"
                      aria-label="사용자 작업 메뉴"
                      onClick={(e) => handleMenuOpen(e, user)}
                    >
                      <MoreVert fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={data?.total || 0}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="페이지당 행:"
      />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            if (selectedUser) {
              setNewRole(selectedUser.role === 'admin' ? 'user' : 'admin');
              setRoleDialogOpen(true);
            }
          }}
        >
          역할 변경
        </MenuItem>
      </Menu>

      <Dialog
        open={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>역할 변경</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selectedUser?.name} ({selectedUser?.email})
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>역할</InputLabel>
            <Select
              value={newRole}
              label="역할"
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
            >
              <MenuItem value="admin">관리자</MenuItem>
              <MenuItem value="user">일반 사용자</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleRoleChange}
            disabled={updateRole.isPending}
            disableElevation
          >
            변경
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
