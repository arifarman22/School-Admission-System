import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StudentIdentityBar } from '../components/admission/StudentIdentityBar';
import { json, mockApi, problem, renderRoutes } from '../test/utils';
import type { AdmissionClass, Hold, HoldCreated, StudentHold } from '../types/api';
import { STUDENT_ID_STORAGE_KEY } from '../utils/studentId';
import { AdmissionPage } from './AdmissionPage';
import { ClassListPage } from './ClassListPage';
import { MyApplicationsPage } from './MyApplicationsPage';

const STUDENT = '20152691234567890';
const CLASS_ID = '3f0d6c2e-1b7a-4c51-9a55-2d3f2b9b1e01';
const HOLD_ID = '8a4e1d0c-6b3f-4e2a-9c7d-1f2e3d4c5b6a';

const admissionClass: AdmissionClass = {
  id: CLASS_ID,
  name: 'Class 6 - Morning Shift',
  totalSeats: 120,
  heldSeats: 15,
  confirmedSeats: 80,
  availableSeats: 25,
};

const inTenMinutes = () => new Date(Date.now() + 10 * 60_000).toISOString();

const created = (): HoldCreated => ({
  holdId: HOLD_ID,
  classId: CLASS_ID,
  studentId: STUDENT,
  status: 'HELD',
  expiresAt: inTenMinutes(),
});

const hold = (status: Hold['status'], expiresAt = inTenMinutes()): Hold => ({
  holdId: HOLD_ID,
  classId: CLASS_ID,
  status,
  expiresAt,
});

const mine = (status: StudentHold['status']): StudentHold => ({
  holdId: HOLD_ID,
  classId: CLASS_ID,
  className: admissionClass.name,
  status,
  expiresAt: inTenMinutes(),
});

const appRoutes = [
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
  {
    path: '/me/applications',
    element: (
      <>
        <StudentIdentityBar />
        <MyApplicationsPage />
      </>
    ),
  },
];

const detailHandlers = (holdResponses: (() => Response)[], myHolds = [mine('HELD')]) => ({
  [`GET /holds/${HOLD_ID}`]: holdResponses,
  [`GET /classes/${CLASS_ID}`]: () => json(200, admissionClass),
  'GET /me/holds': () => json(200, myHolds),
});

describe('student identity', () => {
  it.each([
    ['2015269123456789', 'Must be exactly 17 digits (you entered 16).'],
    ['201526912345678901', 'Must be exactly 17 digits (you entered 18).'],
    ['2015-2691-23456789', 'Use digits 0–9 only, with no spaces or dashes.'],
    ['2015269123456789a', 'Use digits 0–9 only, with no spaces or dashes.'],
  ])('rejects %s', async (value, message) => {
    mockApi({ 'GET /classes': () => json(200, []) });
    renderRoutes(appRoutes, { initialPath: '/classes' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Birth registration number'), value);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBeNull();
  });

  it('persists a valid 17-digit ID locally and can clear it', async () => {
    mockApi({ 'GET /classes': () => json(200, []) });
    renderRoutes(appRoutes, { initialPath: '/classes' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Birth registration number'), STUDENT);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBe(STUDENT);
    expect(screen.getByText('2015 •••• •••• 7890')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText('Birth registration number')).toBeInTheDocument();
  });
});

describe('apply', () => {
  it('requires a valid student ID before applying', async () => {
    const { calls } = mockApi({ 'GET /classes': () => json(200, [admissionClass]) });
    renderRoutes(appRoutes, { initialPath: '/classes' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: `Apply now for ${admissionClass.name}` }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /enter your 17-digit birth registration number/i,
    );
    expect(screen.getByLabelText('Birth registration number')).toHaveFocus();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a hold with X-Student-Id and opens admission details', async () => {
    const { calls } = mockApi({
      'GET /classes': () => json(200, [admissionClass]),
      [`POST /classes/${CLASS_ID}/holds`]: () => json(201, created()),
      ...detailHandlers([() => json(200, hold('HELD'))]),
    });
    const { router } = renderRoutes(appRoutes, { initialPath: '/classes', studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: `Apply now for ${admissionClass.name}` }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(`/applications/${HOLD_ID}`));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe(`/classes/${CLASS_ID}/holds`);
    expect(post.headers['x-student-id']).toBe(STUDENT);

    expect(await screen.findByRole('heading', { name: admissionClass.name })).toBeInTheDocument();
    expect(screen.getByText(HOLD_ID)).toBeInTheDocument();
    expect(screen.getAllByText('HELD').length).toBeGreaterThan(0);
    expect(screen.getByRole('timer')).toHaveTextContent(/^(09|10):\d\d$/);
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('explains a 409 when seats are unavailable', async () => {
    mockApi({
      'GET /classes': () => json(200, [admissionClass]),
      [`POST /classes/${CLASS_ID}/holds`]: () =>
        problem(409, 'SEATS_FULL', 'Class has no available seats'),
    });
    renderRoutes(appRoutes, { initialPath: '/classes', studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: `Apply now for ${admissionClass.name}` }),
    );

    expect(await screen.findByText(/seats are unavailable/i)).toBeInTheDocument();
  });

  it('explains a 409 for an existing active application and links to it', async () => {
    mockApi({
      'GET /classes': () => json(200, [admissionClass]),
      [`POST /classes/${CLASS_ID}/holds`]: () => problem(409, 'DUPLICATE_APPLICATION'),
      'GET /me/holds': () => json(200, [mine('HELD')]),
    });
    renderRoutes(appRoutes, { initialPath: '/classes', studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: `Apply now for ${admissionClass.name}` }),
    );

    expect(await screen.findByText(/already have an active application/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'View your application' })).toHaveAttribute(
      'href',
      `/applications/${HOLD_ID}`,
    );
  });
});

describe('admission details', () => {
  it('confirms with X-Student-Id, shows CONFIRMED from the server and disables actions', async () => {
    const { calls } = mockApi({
      ...detailHandlers([() => json(200, hold('HELD')), () => json(200, hold('CONFIRMED'))]),
      [`POST /holds/${HOLD_ID}/confirm`]: () => json(200, { holdId: HOLD_ID, status: 'CONFIRMED' }),
    });
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Confirm Admission' }));

    expect(await screen.findByText('Admission CONFIRMED')).toBeInTheDocument();
    const confirm = calls.find((c) => c.path === `/holds/${HOLD_ID}/confirm`)!;
    expect(confirm.method).toBe('POST');
    expect(confirm.headers['x-student-id']).toBe(STUDENT);

    await waitFor(() =>
      expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('CONFIRMED'),
    );
    expect(screen.getByRole('button', { name: 'Admission confirmed' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
    expect(
      calls.filter((c) => c.path === `/holds/${HOLD_ID}` && c.method === 'GET').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('shows a confirm error from the server', async () => {
    mockApi({
      ...detailHandlers([() => json(200, hold('HELD'))]),
      [`POST /holds/${HOLD_ID}/confirm`]: () => problem(409, 'HOLD_EXPIRED'),
    });
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Confirm Admission' }));

    expect(await screen.findByText('Could not confirm admission')).toBeInTheDocument();
    expect(screen.getByText(/your seat hold has expired/i)).toBeInTheDocument();
  });

  it('asks before cancelling, then cancels with X-Student-Id and refreshes seat counts', async () => {
    const { calls } = mockApi({
      ...detailHandlers([() => json(200, hold('HELD')), () => json(200, hold('CANCELLED'))]),
      [`DELETE /holds/${HOLD_ID}`]: () => new Response(null, { status: 204 }),
    });
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cancel Application' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this application?' });
    expect(within(dialog).getByRole('button', { name: 'Keep application' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Keep application' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Cancel Application' }));
    const classFetchesBefore = calls.filter((c) => c.path === `/classes/${CLASS_ID}`).length;
    await user.click(screen.getByRole('button', { name: 'Yes, cancel application' }));

    expect(await screen.findByText('Application CANCELLED')).toBeInTheDocument();
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.path).toBe(`/holds/${HOLD_ID}`);
    expect(del.headers['x-student-id']).toBe(STUDENT);
    await waitFor(() =>
      expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('CANCELLED'),
    );
    expect(calls.filter((c) => c.path === `/classes/${CLASS_ID}`).length).toBeGreaterThan(
      classFetchesBefore,
    );
  });

  it('closes the cancel dialog with Escape', async () => {
    mockApi(detailHandlers([() => json(200, hold('HELD'))]));
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cancel Application' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not offer actions on another student’s application', async () => {
    mockApi(detailHandlers([() => json(200, hold('HELD'))], []));
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });

    expect(await screen.findByText('Not your application')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
  });

  it('revalidates with the server when the countdown reaches zero', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { calls } = mockApi(
      detailHandlers([() => json(200, hold('HELD', past)), () => json(200, hold('EXPIRED', past))]),
    );
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });

    await waitFor(() =>
      expect(screen.getByText('Final status').nextElementSibling).toHaveTextContent('EXPIRED'),
    );
    expect(calls.filter((c) => c.path === `/holds/${HOLD_ID}`).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
  });

  it('shows not found for an unknown hold', async () => {
    mockApi({
      [`GET /holds/${HOLD_ID}`]: () => problem(404, 'NOT_FOUND'),
      'GET /me/holds': () => json(200, []),
    });
    renderRoutes(appRoutes, { initialPath: `/applications/${HOLD_ID}`, studentId: STUDENT });

    expect(await screen.findByText('Application not found')).toBeInTheDocument();
  });
});

describe('my applications', () => {
  it('lists current and historical applications with links, sending X-Student-Id', async () => {
    const history: StudentHold = {
      holdId: '11111111-2222-4333-8444-555555555555',
      classId: '22222222-3333-4444-8555-666666666666',
      className: 'Class 7 - Day Shift',
      status: 'EXPIRED',
      expiresAt: '2026-11-01T04:10:00Z',
    };
    const { calls } = mockApi({ 'GET /me/holds': () => json(200, [mine('CONFIRMED'), history]) });
    renderRoutes(appRoutes, { initialPath: '/me/applications', studentId: STUDENT });

    const current = await screen.findByRole('region', { name: 'Current' });
    expect(within(current).getByText(admissionClass.name)).toBeInTheDocument();
    expect(within(current).getByText('Confirmed')).toBeInTheDocument();
    expect(within(current).getByRole('link')).toHaveAttribute('href', `/applications/${HOLD_ID}`);

    const past = screen.getByRole('region', { name: 'History' });
    expect(within(past).getByText('Class 7 - Day Shift')).toBeInTheDocument();
    expect(within(past).getByText('Expired')).toBeInTheDocument();

    expect(calls[0]!.headers['x-student-id']).toBe(STUDENT);
  });

  it('restores the student and their applications after a reload', async () => {
    mockApi({ 'GET /me/holds': () => json(200, [mine('HELD')]) });
    window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, STUDENT);

    renderRoutes(appRoutes, { initialPath: '/me/applications' });

    expect(await screen.findByText(admissionClass.name)).toBeInTheDocument();
    expect(screen.getByText('2015 •••• •••• 7890')).toBeInTheDocument();
  });

  it('shows an empty state with no applications', async () => {
    mockApi({ 'GET /me/holds': () => json(200, []) });
    renderRoutes(appRoutes, { initialPath: '/me/applications', studentId: STUDENT });

    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });

  it('asks for a student ID and makes no request without one', async () => {
    const { calls } = mockApi({});
    renderRoutes(appRoutes, { initialPath: '/me/applications' });

    expect(screen.getByText('Student identity required')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
