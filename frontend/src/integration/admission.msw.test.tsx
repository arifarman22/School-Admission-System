import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_SECONDS, OTHER_STUDENT, STUDENT, setupFakeBackend } from '../test/fakeBackend';
import { advance, detail, findCard, renderApp, stat, installFakeClock } from '../test/renderApp';

const api = setupFakeBackend();

beforeEach(installFakeClock);
afterEach(() => vi.useRealTimers());

const timer = () => screen.getByRole('timer').textContent;
const finalStatus = () => screen.getByText('Final status').nextElementSibling?.textContent;

async function applyFromList(className: string, studentId = STUDENT) {
  const app = renderApp('/classes', { studentId });
  await app.user.click(
    within(await findCard(className)).getByRole('button', { name: `Apply now for ${className}` }),
  );
  await waitFor(() => expect(app.router.state.location.pathname).toMatch(/^\/applications\//));
  const holdId = app.router.state.location.pathname.split('/').pop()!;
  await screen.findByRole('timer');
  return { ...app, holdId };
}

async function openHold(holdId: string, studentId = STUDENT) {
  const app = renderApp(`/applications/${holdId}`, { studentId });
  await screen.findByText('Hold ID');
  return app;
}

describe('6. Apply Now', () => {
  it('creates a hold with X-Student-Id and opens the admission details', async () => {
    const cls = api.backend.addClass('Class 6', 2);
    const { holdId } = await applyFromList('Class 6');

    const post = api.backend.requests.find(
      (r) => r.method === 'POST' && r.path.endsWith('/holds'),
    )!;
    expect(post.path).toBe(`/classes/${cls.id}/holds`);
    expect(post.studentId).toBe(STUDENT);
    expect(api.backend.holdStatus(holdId)).toBe('HELD');
    expect(detail('Status')).toBe('HELD');
  });

  it('asks for a student ID first and sends no request without one', async () => {
    api.backend.addClass('Class 6', 2);
    const { user } = renderApp('/classes');
    await user.click(
      within(await findCard('Class 6')).getByRole('button', { name: 'Apply now for Class 6' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your 17-digit/i);
    expect(screen.getByLabelText('Birth registration number')).toHaveFocus();
    expect(api.backend.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('shows progress and sends exactly one request for repeated clicks', async () => {
    api.backend.addClass('Class 6', 2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api.server.use(
      http.post(api.backend.url('/classes/:classId/holds'), async () => {
        await gate;
        return undefined;
      }),
    );
    const { user } = renderApp('/classes', { studentId: STUDENT });
    const button = within(await findCard('Class 6')).getByRole('button', {
      name: 'Apply now for Class 6',
    });
    await user.click(button);
    expect(button).toHaveTextContent('Holding a seat…');
    expect(button).toBeDisabled();
    await user.click(button);
    release();

    await screen.findByRole('timer');
    expect(api.backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });
});

describe('7. admission details', () => {
  it('shows class, status, hold ID, seats and expiry from the server', async () => {
    const cls = api.backend.addClass('Class 6 - Morning', 3);
    const hold = api.backend.addHold(cls.id, STUDENT);
    await openHold(hold.holdId);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Class 6 - Morning' }),
    ).toBeInTheDocument();
    expect(detail('Status')).toBe('HELD');
    expect(detail('Class')).toBe('Class 6 - Morning');
    expect(detail('Hold ID')).toBe(hold.holdId);
    await waitFor(() => expect(detail('Seats available')).toBe('2 of 3'));
    expect(screen.getByText(/a seat is reserved for you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeEnabled();
  });

  it('shows not found for an unknown hold', async () => {
    renderApp(`/applications/${crypto.randomUUID()}`, { studentId: STUDENT });
    expect(await screen.findByText('Application not found')).toBeInTheDocument();
  });

  it('disables actions on another student’s application', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    const hold = api.backend.addHold(cls.id, OTHER_STUDENT);
    await openHold(hold.holdId);

    expect(await screen.findByText('Not your application')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
  });
});

describe('8. countdown timer', () => {
  it('counts down every second from the server expiresAt', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    const hold = api.backend.addHold(cls.id, STUDENT);
    await openHold(hold.holdId);

    expect(timer()).toBe('10:00');
    await advance(1_000);
    expect(timer()).toBe('09:59');
    await advance(1_000);
    expect(timer()).toBe('09:58');
    await advance(65_000);
    expect(timer()).toBe('08:53');
  });

  it('follows the server value, not the time the page was opened', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    const hold = api.backend.addHold(cls.id, STUDENT, { expiresAt: Date.now() + 95_000 });
    await openHold(hold.holdId);
    expect(timer()).toBe('01:35');
  });

  it('turns urgent in the last minute', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    const hold = api.backend.addHold(cls.id, STUDENT, { expiresAt: Date.now() + 61_000 });
    await openHold(hold.holdId);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    await advance(2_000);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'assertive');
  });
});

describe('9. expired hold UI', () => {
  it('expires without a reload, disables confirmation and releases the seat', async () => {
    const cls = api.backend.addClass('Class 6', 1);
    const hold = api.backend.addHold(cls.id, STUDENT);
    await openHold(hold.holdId);
    await waitFor(() => expect(detail('Seats available')).toBe('0 of 1'));

    await advance(HOLD_SECONDS * 1000);
    await waitFor(() => expect(finalStatus()).toBe('EXPIRED'));

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(detail('Status')).toBe('EXPIRED');
    expect(screen.getByText(/hold expired before it was confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
    await waitFor(() => expect(detail('Seats available')).toBe('1 of 1'));
    expect(api.backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false);
  });

  it('blocks confirmation while the server has not yet reported the expiry', async () => {
    const cls = api.backend.addClass('Class 6', 1);
    const hold = api.backend.addHold(cls.id, STUDENT, { expiresAt: Date.now() + 2_000 });
    let serverSaysHeld = true;
    api.server.use(
      http.get(api.backend.url(`/holds/${hold.holdId}`), () =>
        serverSaysHeld
          ? HttpResponse.json({
              holdId: hold.holdId,
              classId: cls.id,
              status: 'HELD',
              expiresAt: new Date(hold.expiresAt).toISOString(),
            })
          : undefined,
      ),
    );
    await openHold(hold.holdId);

    await advance(2_100);
    expect(await screen.findByRole('button', { name: 'Checking hold status…' })).toBeDisabled();
    expect(detail('Status')).toBe('HELD');

    serverSaysHeld = false;
    await advance(2_100);
    await waitFor(() => expect(finalStatus()).toBe('EXPIRED'));
  });

  it('explains a 409 HOLD_EXPIRED from the server and shows the expired state', async () => {
    const cls = api.backend.addClass('Class 6', 1);
    const hold = api.backend.addHold(cls.id, STUDENT);
    const { user } = await openHold(hold.holdId);
    await screen.findByRole('timer');
    hold.expiresAt = Date.now() - 1;

    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    expect(await screen.findByText('Could not confirm admission')).toBeInTheDocument();
    expect(screen.getByText('Your seat hold has expired. Please apply again.')).toBeInTheDocument();
    await waitFor(() => expect(finalStatus()).toBe('EXPIRED'));
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
    expect(api.backend.holdStatus(hold.holdId)).toBe('EXPIRED');
  });
});

describe('10. confirmation success', () => {
  it('confirms with X-Student-Id and shows CONFIRMED from the server', async () => {
    const cls = api.backend.addClass('Class 6', 2);
    const { holdId, user } = await applyFromList('Class 6');

    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    expect(await screen.findByText('Admission CONFIRMED')).toBeInTheDocument();
    await waitFor(() => expect(finalStatus()).toBe('CONFIRMED'));

    const confirm = api.backend.requests.find((r) => r.path === `/holds/${holdId}/confirm`)!;
    expect(confirm).toMatchObject({ method: 'POST', studentId: STUDENT });
    expect(api.backend.holdStatus(holdId)).toBe('CONFIRMED');
    expect(screen.getByRole('button', { name: 'Admission confirmed' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel Application' })).toBeDisabled();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(api.backend.classAvailability(cls.id)).toMatchObject({
      confirmedSeats: 1,
      heldSeats: 0,
    });
  });

  it('sends one confirm for rapid repeated clicks', async () => {
    api.backend.addClass('Class 6', 2);
    const { holdId, user } = await applyFromList('Class 6');
    const button = screen.getByRole('button', { name: 'Confirm Admission' });
    await user.dblClick(button);
    await user.click(button);

    await screen.findByText('Admission CONFIRMED');
    expect(api.backend.requests.filter((r) => r.path === `/holds/${holdId}/confirm`)).toHaveLength(
      1,
    );
  });
});

describe('11. cancellation success', () => {
  it('asks first, cancels with X-Student-Id, shows CANCELLED and releases the seat', async () => {
    const cls = api.backend.addClass('Class 6', 1);
    const { holdId, user, router } = await applyFromList('Class 6');

    await user.click(screen.getByRole('button', { name: 'Cancel Application' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this application?' });
    expect(within(dialog).getByText(/will be released immediately/i)).toBeInTheDocument();
    expect(api.backend.requests.some((r) => r.method === 'DELETE')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Yes, cancel application' }));
    expect(await screen.findByText('Application CANCELLED')).toBeInTheDocument();
    await waitFor(() => expect(finalStatus()).toBe('CANCELLED'));

    const del = api.backend.requests.find((r) => r.method === 'DELETE')!;
    expect(del).toMatchObject({ path: `/holds/${holdId}`, studentId: STUDENT });
    expect(api.backend.holdStatus(holdId)).toBe('CANCELLED');
    await waitFor(() => expect(detail('Seats available')).toBe('1 of 1'));
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();

    await act(() => router.navigate('/classes'));
    expect(stat(await findCard('Class 6'), 'Available')).toBe('1');
    expect(api.backend.classAvailability(cls.id).availableSeats).toBe(1);
  });

  it('keeps the application when the student backs out of the dialog', async () => {
    api.backend.addClass('Class 6', 1);
    const { holdId, user } = await applyFromList('Class 6');

    await user.click(screen.getByRole('button', { name: 'Cancel Application' }));
    await user.click(screen.getByRole('button', { name: 'Keep application' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel Application' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(api.backend.requests.some((r) => r.method === 'DELETE')).toBe(false);
    expect(api.backend.holdStatus(holdId)).toBe('HELD');
  });
});

describe('12. My Applications', () => {
  it('lists current and past applications with links, using X-Student-Id', async () => {
    const a = api.backend.addClass('Class A', 5);
    const b = api.backend.addClass('Class B', 5);
    const c = api.backend.addClass('Class C', 5);
    const d = api.backend.addClass('Class D', 5);
    const held = api.backend.addHold(a.id, STUDENT);
    api.backend.addHold(b.id, STUDENT, { status: 'CONFIRMED' });
    api.backend.addHold(c.id, STUDENT, { status: 'CANCELLED' });
    api.backend.addHold(d.id, STUDENT, { expiresAt: Date.now() - 1_000 });
    api.backend.addHold(a.id, OTHER_STUDENT);
    renderApp('/me/applications', { studentId: STUDENT });

    const current = await screen.findByRole('region', { name: 'Current' });
    const history = screen.getByRole('region', { name: 'History' });
    expect(within(current).getAllByRole('link')).toHaveLength(2);
    expect(within(current).getByRole('link', { name: /Class A, HELD/ })).toHaveAttribute(
      'href',
      `/applications/${held.holdId}`,
    );
    expect(within(current).getByRole('link', { name: /Class B, CONFIRMED/ })).toBeInTheDocument();
    expect(within(history).getByRole('link', { name: /Class C, CANCELLED/ })).toBeInTheDocument();
    expect(within(history).getByRole('link', { name: /Class D, EXPIRED/ })).toBeInTheDocument();

    const list = api.backend.requests.find((r) => r.path === '/me/holds')!;
    expect(list.studentId).toBe(STUDENT);
  });

  it('moves an application to History when it expires', async () => {
    const a = api.backend.addClass('Class A', 5);
    api.backend.addHold(a.id, STUDENT, { expiresAt: Date.now() + 4_000 });
    renderApp('/me/applications', { studentId: STUDENT });
    await screen.findByRole('region', { name: 'Current' });

    await advance(8_000);
    const history = await screen.findByRole('region', { name: 'History' });
    expect(within(history).getByRole('link', { name: /Class A, EXPIRED/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Current' })).not.toBeInTheDocument();
  });

  it('shows an empty state, and asks for an ID without sending a request', async () => {
    const first = renderApp('/me/applications', { studentId: STUDENT });
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    first.unmount();
    window.localStorage.clear();
    api.backend.requests.length = 0;

    renderApp('/me/applications');
    expect(await screen.findByText('Student identity required')).toBeInTheDocument();
    expect(api.backend.requests.filter((r) => r.path === '/me/holds')).toHaveLength(0);
  });
});

describe('13. browser refresh recovery', () => {
  it('restores the student and the application state from storage and the server', async () => {
    api.backend.addClass('Class 6', 2);
    const first = await applyFromList('Class 6');
    await advance(120_000);
    expect(timer()).toBe('08:00');
    first.unmount();

    const reloaded = renderApp(`/applications/${first.holdId}`);
    expect(screen.getByText('2015 •••• •••• 7890')).toBeInTheDocument();
    await screen.findByRole('timer');
    expect(timer()).toBe('08:00');
    expect(detail('Status')).toBe('HELD');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeEnabled(),
    );

    await reloaded.user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    await waitFor(() => expect(finalStatus()).toBe('CONFIRMED'));
    reloaded.unmount();

    renderApp(`/applications/${first.holdId}`);
    await waitFor(() => expect(finalStatus()).toBe('CONFIRMED'));
    expect(screen.getByRole('button', { name: 'Admission confirmed' })).toBeDisabled();
  });

  it('restores My applications after a refresh', async () => {
    const a = api.backend.addClass('Class A', 5);
    api.backend.addHold(a.id, STUDENT);
    renderApp('/me/applications', { studentId: STUDENT }).unmount();

    renderApp('/me/applications');
    const current = await screen.findByRole('region', { name: 'Current' });
    expect(within(current).getByRole('link', { name: /Class A, HELD/ })).toBeInTheDocument();
  });

  it('ignores a tampered stored ID instead of sending it', async () => {
    window.localStorage.setItem('school-admission.studentId', '12345');
    renderApp('/me/applications');
    expect(await screen.findByText('Student identity required')).toBeInTheDocument();
    expect(api.backend.requests.filter((r) => r.studentId !== null)).toHaveLength(0);
  });
});

describe('14. HTTP 409 conflict handling', () => {
  it('SEATS_FULL: the last seat was taken after the list loaded', async () => {
    const cls = api.backend.addClass('Class 6', 1);
    const { user } = renderApp('/classes', { studentId: STUDENT });
    const card = await findCard('Class 6');
    api.backend.addHold(cls.id, OTHER_STUDENT);

    await user.click(within(card).getByRole('button', { name: 'Apply now for Class 6' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'Seats are unavailable: this class just filled up.',
    );
    await waitFor(() => expect(within(card).getByRole('note')).toHaveTextContent(/full/i));
  });

  it('DUPLICATE_APPLICATION: links to the existing application', async () => {
    const cls = api.backend.addClass('Class 6', 5);
    const existing = api.backend.addHold(cls.id, STUDENT);
    const { user } = renderApp('/classes', { studentId: STUDENT });

    await user.click(
      within(await findCard('Class 6')).getByRole('button', { name: 'Apply now for Class 6' }),
    );
    expect(await screen.findByText(/already have an active application/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'View your application' })).toHaveAttribute(
      'href',
      `/applications/${existing.holdId}`,
    );
  });

  it('HOLD_NOT_ACTIVE: confirming a hold cancelled elsewhere', async () => {
    const cls = api.backend.addClass('Class 6', 5);
    const hold = api.backend.addHold(cls.id, STUDENT);
    const { user } = await openHold(hold.holdId);
    await screen.findByRole('timer');
    hold.status = 'CANCELLED';

    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    expect(await screen.findByText('Could not confirm admission')).toBeInTheDocument();
    expect(screen.getByText('This application is no longer active.')).toBeInTheDocument();
    await waitFor(() => expect(finalStatus()).toBe('CANCELLED'));
    expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeDisabled();
  });
});

describe('15. network failure feedback', () => {
  it('Apply: explains the failure and creates nothing', async () => {
    api.backend.addClass('Class 6', 5);
    api.server.use(
      http.post(api.backend.url('/classes/:classId/holds'), () => HttpResponse.error()),
    );
    const { user, router } = renderApp('/classes', { studentId: STUDENT });

    await user.click(
      within(await findCard('Class 6')).getByRole('button', { name: 'Apply now for Class 6' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot reach the admission service. Check your connection.',
    );
    expect(router.state.location.pathname).toBe('/classes');
  });

  it('Confirm: explains the failure and keeps the hold actionable', async () => {
    const cls = api.backend.addClass('Class 6', 5);
    const hold = api.backend.addHold(cls.id, STUDENT);
    api.server.use(
      http.post(api.backend.url('/holds/:holdId/confirm'), () => HttpResponse.error()),
    );
    const { user } = await openHold(hold.holdId);
    await screen.findByRole('timer');

    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    expect(await screen.findByText('Could not confirm admission')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the admission service/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm Admission' })).toBeEnabled(),
    );
    expect(api.backend.holdStatus(hold.holdId)).toBe('HELD');
  });

  it('Details refresh: keeps the last status, warns, retries and recovers', async () => {
    const cls = api.backend.addClass('Class 6', 5);
    const hold = api.backend.addHold(cls.id, STUDENT);
    await openHold(hold.holdId);
    await screen.findByRole('timer');

    api.server.use(http.get(api.backend.url('/holds/:holdId'), () => HttpResponse.error()));
    await advance(5_000);
    await advance(1_000);
    await advance(2_000);
    expect(await screen.findByText('Could not refresh status')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the admission service/i)).toBeInTheDocument();
    expect(detail('Status')).toBe('HELD');

    api.server.resetHandlers();
    api.server.use(...api.backend.handlers);
    await advance(5_000);
    await waitFor(() =>
      expect(screen.queryByText('Could not refresh status')).not.toBeInTheDocument(),
    );
  });

  it('My applications: shows an error with retry on first load', async () => {
    api.server.use(http.get(api.backend.url('/me/holds'), () => HttpResponse.error()));
    const { user } = renderApp('/me/applications', { studentId: STUDENT });
    await advance(1_000);
    await advance(2_000);
    expect(await screen.findByText('Could not load your applications')).toBeInTheDocument();

    api.server.resetHandlers();
    api.server.use(...api.backend.handlers);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });
});

describe('16. X-Student-Id header inclusion', () => {
  it('is sent on every student action and never on public reads', async () => {
    api.backend.addClass('Class 6', 3);
    const { holdId, user, router } = await applyFromList('Class 6');
    await user.click(screen.getByRole('button', { name: 'Cancel Application' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel application' }));
    await screen.findByText('Application CANCELLED');

    await act(() => router.navigate('/classes'));
    await user.click(
      within(await findCard('Class 6')).getByRole('button', { name: 'Apply now for Class 6' }),
    );
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/classes'));
    const second = router.state.location.pathname.split('/').pop()!;
    await screen.findByRole('timer');
    await user.click(screen.getByRole('button', { name: 'Confirm Admission' }));
    await screen.findByText('Admission CONFIRMED');
    await act(() => router.navigate('/me/applications'));
    await screen.findByRole('region', { name: 'Current' });

    const reqs = api.backend.requests;
    const studentActions = reqs.filter(
      (r) =>
        (r.method === 'POST' && r.path.endsWith('/holds')) ||
        r.path.endsWith('/confirm') ||
        r.method === 'DELETE' ||
        r.path === '/me/holds',
    );
    expect(
      new Set(studentActions.map((r) => `${r.method} ${r.path.replace(/[0-9a-f-]{36}/g, ':id')}`)),
    ).toEqual(
      new Set([
        'POST /classes/:id/holds',
        'DELETE /holds/:id',
        'POST /holds/:id/confirm',
        'GET /me/holds',
      ]),
    );
    for (const r of studentActions) expect(r.studentId, `${r.method} ${r.path}`).toBe(STUDENT);

    const publicReads = reqs.filter((r) => r.method === 'GET' && r.path !== '/me/holds');
    expect(publicReads.length).toBeGreaterThan(0);
    for (const r of publicReads) expect(r.studentId, `${r.method} ${r.path}`).toBeNull();
    expect([holdId, second].every((id) => reqs.some((r) => r.path === `/holds/${id}`))).toBe(true);
  });

  it('uses the newly entered ID after the student changes it', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    api.backend.addHold(cls.id, OTHER_STUDENT);
    const { user } = renderApp('/me/applications', { studentId: STUDENT });
    await screen.findByText('No applications yet');

    await user.click(screen.getByRole('button', { name: 'Change' }));
    const field = screen.getByLabelText('Birth registration number');
    await user.clear(field);
    await user.type(field, OTHER_STUDENT);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('region', { name: 'Current' })).toBeInTheDocument();
    const last = api.backend.requests.filter((r) => r.path === '/me/holds').at(-1)!;
    expect(last.studentId).toBe(OTHER_STUDENT);
  });
});
