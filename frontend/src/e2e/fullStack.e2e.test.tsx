import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StudentIdentityBar } from '../components/admission/StudentIdentityBar';
import { AdmissionPage } from '../pages/AdmissionPage';
import { ClassListPage } from '../pages/ClassListPage';
import { CreateClassPage } from '../pages/CreateClassPage';
import { MyApplicationsPage } from '../pages/MyApplicationsPage';
import { renderRoutes } from '../test/utils';
import { apiBaseUrl } from '../utils/config';
import { STUDENT_ID_STORAGE_KEY } from '../utils/studentId';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.E2E_FULL_STACK === 'true';
const holdSeconds = Number(env?.E2E_HOLD_SECONDS ?? 600);
const shortHolds = holdSeconds <= 30;
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const studentPrefix = String(Math.floor(Math.random() * 9000) + 1000);
let studentCounter = 0;
const nextStudent = () => `${studentPrefix}${String(++studentCounter).padStart(13, '0')}`;

const routes = [
  { path: '/admin/classes/new', element: <CreateClassPage /> },
  {
    path: '/classes',
    element: (
      <>
        <StudentIdentityBar />
        <ClassListPage />
      </>
    ),
  },
  {
    path: '/applications/:holdId',
    element: (
      <>
        <StudentIdentityBar />
        <AdmissionPage />
      </>
    ),
  },
  { path: '/me/applications', element: <MyApplicationsPage /> },
];

async function createClassThroughUi(name: string, seats: number) {
  const view = renderRoutes(routes, { initialPath: '/admin/classes/new' });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Class name'), name);
  await user.type(screen.getByLabelText('Total seats'), String(seats));
  await user.click(screen.getByRole('button', { name: 'Create class' }));
  expect(await screen.findByText('Class created', {}, { timeout: 10_000 })).toBeInTheDocument();
  view.unmount();
}

async function openClassList(studentId: string) {
  window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, studentId);
  const view = renderRoutes(routes, { initialPath: '/classes' });
  return { ...view, user: userEvent.setup() };
}

async function findCard(name: string) {
  return screen.findByRole('article', { name }, { timeout: 10_000 });
}

function stat(card: HTMLElement, label: string) {
  return within(card).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe.skipIf(!enabled)(`full stack through ${apiBaseUrl}`, () => {
  it('admin creates a class and students see it live with correct seat counts', async () => {
    const name = `E2E ${run} Morning`;
    await createClassThroughUi(name, 2);

    const view = await openClassList(nextStudent());
    const card = await findCard(name);
    expect(stat(card, 'Total')).toBe('2');
    expect(stat(card, 'Held')).toBe('0');
    expect(stat(card, 'Confirmed')).toBe('0');
    expect(stat(card, 'Available')).toBe('2');
    view.unmount();
  }, 30_000);

  it('student applies, sees HELD details, confirms and gets CONFIRMED', async () => {
    const name = `E2E ${run} Confirm`;
    await createClassThroughUi(name, 2);
    const student = nextStudent();

    const { router, user, unmount } = await openClassList(student);
    await user.click(
      within(await findCard(name)).getByRole('button', { name: `Apply now for ${name}` }),
    );

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/applications\//), {
      timeout: 10_000,
    });
    const holdId = router.state.location.pathname.split('/').pop()!;
    expect(await screen.findByText(holdId, {}, { timeout: 10_000 })).toBeInTheDocument();
    await waitFor(
      () =>
        expect(screen.getByText('Class', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
          name,
        ),
      { timeout: 10_000 },
    );
    expect(screen.queryByRole('article', { name })).not.toBeInTheDocument();
    if (!shortHolds) expect(screen.getByRole('timer')).toHaveTextContent(/^(09|10):\d\d$/);

    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    expect(
      await screen.findByText('Admission CONFIRMED', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await waitFor(
      () =>
        expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('CONFIRMED'),
      { timeout: 10_000 },
    );
    expect(screen.getByRole('button', { name: 'Admission confirmed' })).toBeDisabled();
    unmount();

    const server = await fetch(`${apiBaseUrl}/holds/${holdId}`).then((r) => r.json());
    expect(server.status).toBe('CONFIRMED');
  }, 45_000);

  it('student cancels after confirming the dialog; seat is released and history is kept', async () => {
    const name = `E2E ${run} Cancel`;
    await createClassThroughUi(name, 1);
    const student = nextStudent();

    const { router, user, unmount } = await openClassList(student);
    await user.click(
      within(await findCard(name)).getByRole('button', { name: `Apply now for ${name}` }),
    );
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/applications\//), {
      timeout: 10_000,
    });
    const holdId = router.state.location.pathname.split('/').pop()!;

    await user.click(await screen.findByRole('button', { name: 'Cancel Application' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel application' }));
    expect(
      await screen.findByText('Application CANCELLED', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    unmount();

    const classes = await fetch(`${apiBaseUrl}/classes`).then((r) => r.json());
    const cls = classes.find((c: { name: string }) => c.name === name);
    expect(cls).toMatchObject({ heldSeats: 0, availableSeats: 1 });

    window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, student);
    const mine = renderRoutes(routes, { initialPath: '/me/applications' });
    const history = await screen.findByRole('region', { name: 'History' }, { timeout: 10_000 });
    expect(within(history).getByText(name)).toBeInTheDocument();
    expect(within(history).getByText('Cancelled')).toBeInTheDocument();
    expect(within(history).getByRole('link')).toHaveAttribute('href', `/applications/${holdId}`);
    mine.unmount();
  }, 45_000);

  it('explains 409s: a full class and a duplicate active application', async () => {
    const name = `E2E ${run} Single`;
    await createClassThroughUi(name, 1);
    const first = nextStudent();
    const second = nextStudent();

    const a = await openClassList(first);
    await a.user.click(
      within(await findCard(name)).getByRole('button', { name: `Apply now for ${name}` }),
    );
    await waitFor(() => expect(a.router.state.location.pathname).toMatch(/^\/applications\//), {
      timeout: 10_000,
    });
    a.unmount();

    const b = await openClassList(second);
    const fullCard = await findCard(name);
    expect(within(fullCard).getByText(/this class is full/i)).toBeInTheDocument();
    b.unmount();

    const twoSeats = `E2E ${run} Duplicate`;
    await createClassThroughUi(twoSeats, 2);
    const c = await openClassList(first);
    await c.user.click(
      within(await findCard(twoSeats)).getByRole('button', { name: `Apply now for ${twoSeats}` }),
    );
    await waitFor(() => expect(c.router.state.location.pathname).toMatch(/^\/applications\//), {
      timeout: 10_000,
    });
    c.unmount();

    const d = await openClassList(first);
    await d.user.click(
      within(await findCard(twoSeats)).getByRole('button', { name: `Apply now for ${twoSeats}` }),
    );
    expect(
      await screen.findByText(/already have an active application/i, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'View your application' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    d.unmount();
  }, 60_000);

  it('another student cannot act on the application and the server agrees', async () => {
    const name = `E2E ${run} Ownership`;
    await createClassThroughUi(name, 2);
    const owner = nextStudent();
    const intruder = nextStudent();

    const a = await openClassList(owner);
    await a.user.click(
      within(await findCard(name)).getByRole('button', { name: `Apply now for ${name}` }),
    );
    await waitFor(() => expect(a.router.state.location.pathname).toMatch(/^\/applications\//), {
      timeout: 10_000,
    });
    const holdId = a.router.state.location.pathname.split('/').pop()!;
    a.unmount();

    window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, intruder);
    const view = renderRoutes(routes, { initialPath: `/applications/${holdId}` });
    expect(
      await screen.findByText('Not your application', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    view.unmount();

    const res = await fetch(`${apiBaseUrl}/holds/${holdId}/confirm`, {
      method: 'POST',
      headers: { 'X-Student-Id': intruder },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('HOLD_NOT_OWNED');
  }, 45_000);

  it.skipIf(!shortHolds)(
    'hold expires without reloading, confirmation closes and the seat is released',
    async () => {
      const name = `E2E ${run} Expiry`;
      await createClassThroughUi(name, 1);
      const student = nextStudent();

      const { router, user, unmount } = await openClassList(student);
      await user.click(
        within(await findCard(name)).getByRole('button', { name: `Apply now for ${name}` }),
      );
      await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/applications\//), {
        timeout: 10_000,
      });
      const holdId = router.state.location.pathname.split('/').pop()!;

      const timer = await screen.findByRole('timer', {}, { timeout: 10_000 });
      const seconds = () => {
        const [mm, ss] = timer.textContent!.split(':').map(Number);
        return mm! * 60 + ss!;
      };
      const start = seconds();
      expect(start).toBeGreaterThan(0);
      expect(start).toBeLessThanOrEqual(holdSeconds);
      await waitFor(() => expect(seconds()).toBeLessThan(start), { timeout: 2500 });
      expect(await screen.findByText('0 of 1', {}, { timeout: 10_000 })).toBeInTheDocument();

      await waitFor(
        () =>
          expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('EXPIRED'),
        { timeout: (holdSeconds + 10) * 1000 },
      );
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
      expect(await screen.findByText('1 of 1', {}, { timeout: 10_000 })).toBeInTheDocument();
      unmount();

      const late = await fetch(`${apiBaseUrl}/holds/${holdId}/confirm`, {
        method: 'POST',
        headers: { 'X-Student-Id': student },
      });
      expect(late.status).toBe(409);
      expect((await late.json()).code).toBe('HOLD_EXPIRED');

      const list = await openClassList(student);
      const card = await findCard(name);
      expect(stat(card, 'Held')).toBe('0');
      expect(stat(card, 'Available')).toBe('1');
      list.unmount();

      window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, student);
      const reloaded = renderRoutes(routes, { initialPath: `/applications/${holdId}` });
      await waitFor(
        () =>
          expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('EXPIRED'),
        { timeout: 10_000 },
      );
      expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
      reloaded.unmount();

      window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, student);
      const mine = renderRoutes(routes, { initialPath: '/me/applications' });
      const history = await screen.findByRole('region', { name: 'History' }, { timeout: 10_000 });
      expect(within(history).getByText(name)).toBeInTheDocument();
      expect(within(history).getByText('Expired')).toBeInTheDocument();
      mine.unmount();
    },
    (holdSeconds + 60) * 1000,
  );
});
