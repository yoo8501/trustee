import { createBrowserRouter } from 'react-router';
import { ProtectedRoute, PublicOnlyRoute } from '../components';
import { AdminAttendanceAuditPage } from './admin/audit-attendance';
import { AdminLayout } from './admin/_layout';
import { AdminLeaveTypesPage } from './admin/leave-types';
import { AdminTeamsPage } from './admin/teams';
import { AdminUsersPage } from './admin/users';
import { HealthzRoute } from './healthz';
import { HomeRoute } from './home';
import { LoginRoute } from './login';
import { NotFoundRoute } from './not-found';
import { RegisterRoute } from './register';
import { RootLayout } from './root';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute>
            <HomeRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'login',
        element: (
          <PublicOnlyRoute>
            <LoginRoute />
          </PublicOnlyRoute>
        ),
      },
      {
        path: 'register',
        element: (
          <PublicOnlyRoute>
            <RegisterRoute />
          </PublicOnlyRoute>
        ),
      },
      {
        path: 'admin',
        element: (
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'teams', element: <AdminTeamsPage /> },
          { path: 'leave-types', element: <AdminLeaveTypesPage /> },
          { path: 'audit/attendance', element: <AdminAttendanceAuditPage /> },
        ],
      },
      { path: 'healthz', Component: HealthzRoute },
      { path: '*', Component: NotFoundRoute },
    ],
  },
]);

export {
  AdminAttendanceAuditPage,
  AdminLayout,
  AdminLeaveTypesPage,
  AdminTeamsPage,
  AdminUsersPage,
  HealthzRoute,
  HomeRoute,
  LoginRoute,
  NotFoundRoute,
  RegisterRoute,
  RootLayout,
};
