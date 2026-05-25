import { createBrowserRouter } from 'react-router';
import { ProtectedRoute, PublicOnlyRoute } from '../components';
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
      { path: 'healthz', Component: HealthzRoute },
      { path: '*', Component: NotFoundRoute },
    ],
  },
]);

export {
  HealthzRoute,
  HomeRoute,
  LoginRoute,
  NotFoundRoute,
  RegisterRoute,
  RootLayout,
};
