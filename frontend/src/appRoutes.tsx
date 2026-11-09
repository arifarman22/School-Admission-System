import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { AdmissionPage } from './pages/AdmissionPage';
import { ClassListPage } from './pages/ClassListPage';
import { CreateClassPage } from './pages/CreateClassPage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { routes } from './utils/routes';

export const appRoutes: RouteObject[] = [
  {
    path: routes.home,
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to={routes.classes} replace /> },
      { path: 'classes', element: <ClassListPage /> },
      { path: 'applications/:holdId', element: <AdmissionPage /> },
      { path: 'me/applications', element: <MyApplicationsPage /> },
      { path: 'admin/classes/new', element: <CreateClassPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
