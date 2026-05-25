// RED stub — Sprint 1 TDD
import { createBrowserRouter } from 'react-router';
import { HealthzRoute } from './healthz';
import { HomeRoute } from './home';
import { LoginRoute } from './login';
import { NotFoundRoute } from './not-found';
import { RootLayout } from './root';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [{ index: true, Component: HomeRoute }],
  },
]);

export { HealthzRoute, HomeRoute, LoginRoute, NotFoundRoute, RootLayout };
