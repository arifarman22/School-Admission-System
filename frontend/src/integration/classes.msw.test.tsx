import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problem, STUDENT, setupFakeBackend } from '../test/fakeBackend';
import { advance, findCard, renderApp, stat, installFakeClock } from '../test/renderApp';
import { STUDENT_ID_STORAGE_KEY } from '../utils/studentId';

const api = setupFakeBackend();

beforeEach(installFakeClock);
afterEach(() => vi.useRealTimers());

describe('1. welcome screen and student ID input', () => {
  it('asks for the birth registration number when the site opens, before loading anything', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Birth registration number')).toHaveFocus();
    expect(screen.getByText('0 of 17 digits. Spaces and dashes are fine.')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    for (const step of ['Choose a class', 'Your seat is held for you', 'Confirm admission']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(api.backend.requests).toHaveLength(0);
  });

  it.each([
    ['', 'Enter your birth registration number.'],
    ['12345', 'Must be exactly 17 digits (you entered 5).'],
    ['201526912345678901', 'Must be exactly 17 digits (you entered 18).'],
    ['2015269123456789a', 'Use digits 0–9 only.'],
    ['2015-2691-2345678', 'Must be exactly 17 digits (you entered 15).'],
  ])('rejects %j and saves nothing', async (input, message) => {
    const { user } = renderApp('/classes');
    const field = screen.getByLabelText('Birth registration number');
    if (input) await user.type(field, input);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBeNull();
    expect(api.backend.requests).toHaveLength(0);
  });

  it('counts digits as they are typed and accepts spaces and dashes', async () => {
    const { user } = renderApp('/classes');
    const field = screen.getByLabelText('Birth registration number');
    await user.type(field, '2015 2691');
    expect(screen.getByText('8 of 17 digits. Spaces and dashes are fine.')).toBeInTheDocument();
    await user.type(field, '-2345-67890');
    expect(screen.getByText('All 17 digits entered.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('2015 •••• •••• 7890')).toBeInTheDocument();
    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBe(STUDENT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Classes' })).toBeInTheDocument();
  });

  it('can change and clear the ID, returning to the welcome screen', async () => {
    const { user } = renderApp('/classes', { studentId: STUDENT });
    expect(await screen.findByText('2015 •••• •••• 7890')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    const field = screen.getByLabelText('Birth registration number');
    await user.type(field, '20152691234567891');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('2015 •••• •••• 7891')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /welcome/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(STUDENT_ID_STORAGE_KEY)).toBeNull();
  });

  it('clears the error as soon as the student edits the value', async () => {
    const { user } = renderApp('/classes');
    await user.type(screen.getByLabelText('Birth registration number'), '123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/must be exactly 17 digits/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Birth registration number'), '4');
    expect(screen.queryByText(/must be exactly 17 digits/i)).not.toBeInTheDocument();
  });

  it('lets an administrator reach the admin panel without a student ID', async () => {
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Go to the admin panel' }));
    expect(router.state.location.pathname).toBe('/admin/classes/new');
    expect(await screen.findByLabelText('Class name')).toBeInTheDocument();
  });
});

describe('2. class creation form', () => {
  it('validates on the client and sends nothing for invalid input', async () => {
    const { user } = renderApp('/admin/classes/new');
    await user.click(await screen.findByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Enter a class name.')).toBeInTheDocument();
    expect(screen.getByText('Enter the total number of seats.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Class name'), '   ');
    await user.type(screen.getByLabelText('Total seats'), '0');
    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(await screen.findByText('A class needs at least 1 seat.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Total seats'));
    await user.type(screen.getByLabelText('Total seats'), '10001');
    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(await screen.findByText('Use at most 10,000 seats.')).toBeInTheDocument();

    expect(api.backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('creates a class, normalises the name, resets the form and shows it in the class list', async () => {
    const { user, router } = renderApp('/admin/classes/new', { studentId: STUDENT });
    await user.type(screen.getByLabelText('Class name'), '  Class 6   Morning  ');
    await user.type(screen.getByLabelText('Total seats'), '40');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Class created')).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveValue('');
    const post = api.backend.requests.find((r) => r.method === 'POST' && r.path === '/classes')!;
    await waitFor(() => expect(post.body).toEqual({ name: 'Class 6 Morning', totalSeats: 40 }));

    await act(() => router.navigate('/classes'));
    const card = await findCard('Class 6 Morning');
    expect(stat(card, 'Total')).toBe('40');
    expect(stat(card, 'Available')).toBe('40');
  });

  it('shows the 409 duplicate-name conflict on the name field', async () => {
    api.backend.addClass('Class 7', 30);
    const { user } = renderApp('/admin/classes/new');
    await user.type(screen.getByLabelText('Class name'), 'Class 7');
    await user.type(screen.getByLabelText('Total seats'), '25');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('A class with this name already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Class created')).not.toBeInTheDocument();
  });

  it('maps server-side field validation errors onto the form', async () => {
    api.server.use(
      http.post(api.backend.url('/classes'), () =>
        problem(400, 'VALIDATION_ERROR', 'invalid', { TotalSeats: ['Server says too many seats'] }),
      ),
    );
    const { user } = renderApp('/admin/classes/new');
    await user.type(screen.getByLabelText('Class name'), 'Class 8');
    await user.type(screen.getByLabelText('Total seats'), '50');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Server says too many seats')).toBeInTheDocument();
  });

  it('explains a network failure without losing what was typed', async () => {
    api.server.use(http.post(api.backend.url('/classes'), () => HttpResponse.error()));
    const { user } = renderApp('/admin/classes/new');
    await user.type(screen.getByLabelText('Class name'), 'Class 9');
    await user.type(screen.getByLabelText('Total seats'), '20');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText(/cannot reach the admission service/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveValue('Class 9');
  });

  it('does not submit twice while the first request is pending', async () => {
    let release!: () => void;
    api.server.use(
      http.post(api.backend.url('/classes'), async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json(
          { id: crypto.randomUUID(), name: 'Class 10', totalSeats: 5 },
          { status: 201 },
        );
      }),
    );
    const { user } = renderApp('/admin/classes/new');
    await user.type(screen.getByLabelText('Class name'), 'Class 10');
    await user.type(screen.getByLabelText('Total seats'), '5');
    const submit = screen.getByRole('button', { name: 'Create class' });
    await user.click(submit);
    await user.click(submit);
    await user.keyboard('{Enter}');

    expect(api.backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    release();
    expect(await screen.findByText('Class created')).toBeInTheDocument();
  });
});

describe('3-5. class list, seat counts and full classes', () => {
  it('renders every class from the server', async () => {
    api.backend.addClass('Class 1 - Morning', 30);
    api.backend.addClass('Class 2 - Day', 25);
    renderApp('/classes', { studentId: STUDENT });

    const list = await screen.findByRole('list', { name: 'Classes' });
    expect(
      within(list)
        .getAllByRole('article')
        .map((a) => a.querySelector('h2')!.textContent),
    ).toEqual(['Class 1 - Morning', 'Class 2 - Day']);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows total, held, confirmed and available seats exactly as the server reports', async () => {
    const cls = api.backend.addClass('Class 6', 40);
    api.backend.fill(cls.id, 30, 'CONFIRMED');
    api.backend.fill(cls.id, 5, 'HELD');
    renderApp('/classes', { studentId: STUDENT });

    const card = await findCard('Class 6');
    expect(stat(card, 'Total')).toBe('40');
    expect(stat(card, 'Held')).toBe('5');
    expect(stat(card, 'Confirmed')).toBe('30');
    expect(stat(card, 'Available')).toBe('5');
    expect(within(card).getByRole('img')).toHaveAccessibleName(
      '30 confirmed, 5 held, 5 available of 40 seats',
    );
    expect(within(card).getByText('5 seats available')).toBeInTheDocument();
  });

  it('updates seat counts every 3 seconds without a reload', async () => {
    const cls = api.backend.addClass('Class 6', 3);
    renderApp('/classes', { studentId: STUDENT });
    const card = await findCard('Class 6');
    expect(stat(card, 'Available')).toBe('3');

    api.backend.fill(cls.id, 1, 'HELD');
    await advance(2_900);
    expect(stat(card, 'Available')).toBe('3');
    await advance(200);
    await waitFor(() => expect(stat(card, 'Available')).toBe('2'));
    expect(stat(card, 'Held')).toBe('1');
  });

  it('shows a full class without an Apply button', async () => {
    const cls = api.backend.addClass('Class 7 - Full', 2);
    api.backend.fill(cls.id, 2, 'CONFIRMED');
    renderApp('/classes', { studentId: STUDENT });

    const card = await findCard('Class 7 - Full');
    expect(stat(card, 'Available')).toBe('0');
    expect(within(card).getAllByText('Full')).toHaveLength(2);
    expect(within(card).getByRole('note')).toHaveTextContent(/this class is full/i);
    expect(within(card).queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('turns a class into full live when its last seat is taken', async () => {
    const cls = api.backend.addClass('Class 8', 1);
    renderApp('/classes', { studentId: STUDENT });
    const card = await findCard('Class 8');
    expect(within(card).getByRole('button', { name: 'Apply now for Class 8' })).toBeEnabled();

    api.backend.fill(cls.id, 1, 'HELD');
    await advance(3_100);
    await waitFor(() => expect(within(card).getByRole('note')).toHaveTextContent(/full/i));
    expect(within(card).queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no classes', async () => {
    renderApp('/classes', { studentId: STUDENT });
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
  });
});

describe('class list usability', () => {
  it('shows each class number and finds classes by name or number', async () => {
    api.backend.addClass('Class 6 - Morning Shift', 30);
    const day = api.backend.addClass('Class 6 - Day Shift', 30);
    api.backend.addClass('Class 7 - Morning Shift', 30);
    const { user } = renderApp('/classes', { studentId: STUDENT });

    const card = await findCard('Class 6 - Day Shift');
    expect(within(card).getByText(`Class #${day.id}`)).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search classes' });
    await user.type(search, 'morning');
    expect(screen.getAllByRole('article').map((a) => a.querySelector('h2')!.textContent)).toEqual([
      'Class 6 - Morning Shift',
      'Class 7 - Morning Shift',
    ]);

    await user.clear(search);
    await user.type(search, `#${day.id}`);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Class 6 - Day Shift' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Class 9');
    expect(screen.getByText('No matching classes')).toBeInTheDocument();
  });

  it('warns when only a few seats are left', async () => {
    const tight = api.backend.addClass('Class 8', 40);
    api.backend.fill(tight.id, 37, 'CONFIRMED');
    const roomy = api.backend.addClass('Class 9', 40);
    api.backend.fill(roomy.id, 10, 'CONFIRMED');
    renderApp('/classes', { studentId: STUDENT });

    expect(
      within(await findCard('Class 8')).getByText('Hurry: only 3 seats left.'),
    ).toBeInTheDocument();
    expect(within(await findCard('Class 9')).queryByText(/hurry/i)).not.toBeInTheDocument();
  });
});

describe('15. network failure feedback on the class list', () => {
  it('explains a failed first load and recovers with Try again', async () => {
    api.backend.addClass('Class 1', 10);
    api.server.use(
      http.get(api.backend.url('/classes'), () => HttpResponse.error(), { once: true }),
    );
    const { user } = renderApp('/classes', { studentId: STUDENT });

    expect(await screen.findByText('Could not load classes')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the admission service/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await findCard('Class 1')).toBeInTheDocument();
  });

  it('keeps the last data, warns it is stale, shows Reconnecting and recovers', async () => {
    api.backend.addClass('Class 1', 10);
    renderApp('/classes', { studentId: STUDENT });
    await findCard('Class 1');

    api.server.use(http.get(api.backend.url('/classes'), () => HttpResponse.error()));
    await advance(3_100);
    expect(await screen.findByText('Showing last known availability')).toBeInTheDocument();
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(await findCard('Class 1')).toBeInTheDocument();

    let release!: () => void;
    api.server.resetHandlers();
    api.server.use(
      http.get(api.backend.url('/classes'), async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json([]);
      }),
      ...api.backend.handlers,
    );
    await advance(3_100);
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Showing last known availability')).not.toBeInTheDocument();
  });

  it('shows a readable message for a server error response', async () => {
    api.server.use(
      http.get(api.backend.url('/classes'), () => problem(503, 'SERVICE_UNAVAILABLE', 'down')),
    );
    renderApp('/classes', { studentId: STUDENT });
    expect(await screen.findByText('Could not load classes')).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
  });
});
