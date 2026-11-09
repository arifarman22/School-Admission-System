import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { appRoutes } from '../appRoutes';
import { StudentIdProvider } from '../hooks/StudentIdProvider';
import { createQueryClient } from '../utils/queryClient';
import { STUDENT_ID_STORAGE_KEY } from '../utils/studentId';

export function installFakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
}

export function advance(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

export function renderApp(path: string, { studentId }: { studentId?: string } = {}) {
  if (studentId) window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, studentId);
  const queryClient = createQueryClient();
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StudentIdProvider>
        <RouterProvider router={router} />
      </StudentIdProvider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    router,
    user,
    queryClient,
    unmount() {
      view.unmount();
      queryClient.clear();
    },
  };
}

export async function findCard(name: string) {
  return screen.findByRole('article', { name });
}

export function stat(card: HTMLElement, label: string) {
  return within(card).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

export function detail(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}
