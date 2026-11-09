import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { appRoutes } from './appRoutes';

const router = createBrowserRouter(appRoutes);

export default function App() {
  return <RouterProvider router={router} />;
}
