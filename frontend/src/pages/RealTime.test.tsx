import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StudentIdentityBar } from '../components/admission/StudentIdentityBar';
import { json, mockApi, renderRoutes, type RecordedCall } from '../test/utils';
import type { AdmissionClass, Hold, StudentHold } from '../types/api';
import { AdmissionPage } from './AdmissionPage';
import { ClassListPage } from './ClassListPage';

const STUDENT = '20152691234567890';
const CLASS_ID = 6;
const HOLD_ID = '8a4e1d0c-6b3f-4e2a-9c7d-1f2e3d4c5b6a';

const cls = (heldSeats: number): AdmissionClass => ({
  id: CLASS_ID,
  name: 'Class 6 - Morning Shift',
  section: 'A',
  totalSeats: 1,
  heldSeats,
  confirmedSeats: 0,
  availableSeats: 1 - heldSeats,
});

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const hold = (status: Hold['status'], expiresAt: string): Hold => ({
  holdId: HOLD_ID,
  classId: CLASS_ID,
  status,
  expiresAt,
});
const mine = (status: StudentHold['status'], expiresAt: string): StudentHold => ({
  ...hold(status, expiresAt),
  className: cls(0).name,
  section: 'A',
});

const routes = [
  {
    path: '/applications/:holdId',
    element: (
      <>
        <StudentIdentityBar />
        <AdmissionPage />
      </>
    ),
  },
  { path: '/classes', element: <ClassListPage /> },
];

const openDetails = () =>
  renderRoutes(routes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });

const count = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).length;

const timerSeconds = () => {
  const [mm, ss] = screen.getByRole('timer').textContent!.split(':').map(Number);
  return mm! * 60 + ss!;
};

const deferred = () => {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
};

const focusWindow = () =>
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });

describe('real-time admission behavior', () => {
  it('counts down every second from the server-provided expiresAt', async () => {
    const expiresAt = inSeconds(65);
    mockApi({
      [`GET /holds/${HOLD_ID}`]: () => json(200, hold('HELD', expiresAt)),
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });
    openDetails();

    const timer = await screen.findByRole('timer');
    expect(timer).toHaveTextContent(/^01:0[45]$/);
    const first = timerSeconds();

    await waitFor(() => expect(timerSeconds()).toBe(first - 1), { timeout: 1500 });
    await waitFor(() => expect(timerSeconds()).toBe(first - 2), { timeout: 1500 });
  }, 8000);

  it('expires without a reload: shows EXPIRED, disables confirmation and refreshes seats', async () => {
    const expiresAt = inSeconds(2);
    const { calls } = mockApi({
      [`GET /holds/${HOLD_ID}`]: [
        () => json(200, hold('HELD', expiresAt)),
        () => json(200, hold('EXPIRED', expiresAt)),
      ],
      [`GET /classes/${CLASS_ID}`]: [() => json(200, cls(1)), () => json(200, cls(0))],
      'GET /me/holds': [
        () => json(200, [mine('HELD', expiresAt)]),
        () => json(200, [mine('EXPIRED', expiresAt)]),
      ],
    });
    openDetails();

    expect(await screen.findByRole('button', { name: 'Confirm Admission' })).toBeEnabled();
    expect(await screen.findByText('0 of 1')).toBeInTheDocument();

    await waitFor(
      () =>
        expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('EXPIRED'),
      { timeout: 4000 },
    );
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
    expect(screen.getByText(/hold expired before it was confirmed/i)).toBeInTheDocument();

    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    expect(count(calls, 'GET', `/classes/${CLASS_ID}`)).toBeGreaterThanOrEqual(2);
    expect(count(calls, 'POST', `/holds/${HOLD_ID}/confirm`)).toBe(0);
  }, 10000);

  it('does not trust the local timer alone and keeps rechecking until the server agrees', async () => {
    const expiresAt = inSeconds(1);
    const { calls } = mockApi({
      [`GET /holds/${HOLD_ID}`]: [
        () => json(200, hold('HELD', expiresAt)),
        () => json(200, hold('HELD', expiresAt)),
        () => json(200, hold('EXPIRED', expiresAt)),
      ],
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });
    openDetails();
    await screen.findByRole('timer');

    expect(
      await screen.findByRole('button', { name: 'Checking hold status…' }, { timeout: 3000 }),
    ).toBeDisabled();
    expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('HELD');

    await waitFor(
      () =>
        expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('EXPIRED'),
      { timeout: 5000 },
    );
    expect(count(calls, 'GET', `/holds/${HOLD_ID}`)).toBeGreaterThanOrEqual(3);
  }, 10000);

  it('revalidates the hold and the class list when the browser regains focus', async () => {
    const expiresAt = inSeconds(600);
    const { calls } = mockApi({
      [`GET /holds/${HOLD_ID}`]: () => json(200, hold('HELD', expiresAt)),
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
      'GET /classes': () => json(200, [cls(1)]),
    });
    const view = openDetails();
    await screen.findByRole('timer');
    const before = count(calls, 'GET', `/holds/${HOLD_ID}`);
    focusWindow();
    await waitFor(() => expect(count(calls, 'GET', `/holds/${HOLD_ID}`)).toBe(before + 1));

    await act(() => view.router.navigate('/classes'));
    await screen.findByRole('article', { name: cls(0).name });
    const listBefore = count(calls, 'GET', '/classes');
    focusWindow();
    await waitFor(() => expect(count(calls, 'GET', '/classes')).toBe(listBefore + 1), {
      timeout: 1000,
    });
  });

  it('shows a readable message and a reconnecting state when a refresh fails', async () => {
    const expiresAt = inSeconds(600);
    const retry = deferred();
    mockApi({
      [`GET /holds/${HOLD_ID}`]: [
        () => json(200, hold('HELD', expiresAt)),
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => retry.promise,
      ],
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });
    openDetails();
    await screen.findByRole('timer');

    focusWindow();
    expect(await screen.findByText('Could not refresh status')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the admission service/i)).toBeInTheDocument();
    expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('HELD');

    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();

    retry.resolve(json(200, hold('HELD', expiresAt)));
    await waitFor(() => expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument());
    expect(screen.queryByText('Could not refresh status')).not.toBeInTheDocument();
  });

  it('shows Reconnecting on the class list while retrying after a failed refresh', async () => {
    const retry = deferred();
    mockApi({
      'GET /classes': [
        () => json(200, [cls(0)]),
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => retry.promise,
      ],
    });
    renderRoutes(routes, { initialPath: '/classes' });
    await screen.findByRole('article', { name: cls(0).name });

    expect(await screen.findByText('Connection lost', {}, { timeout: 4500 })).toBeInTheDocument();
    expect(await screen.findByText('Reconnecting…', {}, { timeout: 4500 })).toBeInTheDocument();
    retry.resolve(json(200, [cls(1)]));
    expect(await screen.findByText('Live')).toBeInTheDocument();
  }, 12000);

  it('sends a single confirm request when the button is pressed repeatedly', async () => {
    const expiresAt = inSeconds(600);
    const pending = deferred();
    const { calls } = mockApi({
      [`GET /holds/${HOLD_ID}`]: () => json(200, hold('HELD', expiresAt)),
      [`POST /holds/${HOLD_ID}/confirm`]: () => pending.promise,
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });
    openDetails();
    const button = await screen.findByRole('button', { name: 'Confirm Admission' });
    await waitFor(() => expect(button).toBeEnabled());

    const user = userEvent.setup();
    await user.dblClick(button);
    await user.click(button);
    expect(count(calls, 'POST', `/holds/${HOLD_ID}/confirm`)).toBe(1);
    expect(button).toBeDisabled();

    pending.resolve(json(200, { holdId: HOLD_ID, status: 'CONFIRMED' }));
    expect(await screen.findByText('Admission CONFIRMED')).toBeInTheDocument();
  });

  it('stops polling and timers after leaving the page', async () => {
    const expiresAt = inSeconds(600);
    const { calls } = mockApi({
      'GET /classes': () => json(200, [cls(0)]),
      [`GET /holds/${HOLD_ID}`]: () => json(200, hold('HELD', expiresAt)),
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });

    const list = renderRoutes(routes, { initialPath: '/classes' });
    await screen.findByRole('article', { name: cls(0).name });
    list.unmount();
    const details = openDetails();
    await screen.findByRole('timer');
    details.unmount();

    const settled = calls.length;
    await new Promise((resolve) => setTimeout(resolve, 6000));
    expect(calls).toHaveLength(settled);
  }, 12000);

  it('restores the student and the application state from the server after a page refresh', async () => {
    const expiresAt = inSeconds(300);
    mockApi({
      [`GET /holds/${HOLD_ID}`]: () => json(200, hold('HELD', expiresAt)),
      [`GET /classes/${CLASS_ID}`]: () => json(200, cls(1)),
      'GET /me/holds': () => json(200, [mine('HELD', expiresAt)]),
    });

    const first = openDetails();
    await screen.findByRole('timer');
    first.unmount();

    renderRoutes(routes, { initialPath: `/applications/${HOLD_ID}` });
    const timer = await screen.findByRole('timer');
    expect(timer).toHaveTextContent(/^0[45]:\d\d$/);
    expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('HELD');
    expect(screen.getByText(/•••/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeEnabled(),
    );
    expect(within(screen.getByRole('timer').parentElement!).getByText(/expires/i)).toBeVisible();
  });
});
