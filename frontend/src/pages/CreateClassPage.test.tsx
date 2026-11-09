import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, problem, renderRoutes } from '../test/utils';
import { ClassListPage } from './ClassListPage';
import { CreateClassPage } from './CreateClassPage';

const created = { id: '5d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d', name: 'Class 8', totalSeats: 40 };

function renderForm() {
  return renderRoutes([{ path: '/admin/classes/new', element: <CreateClassPage /> }]);
}

async function fill(name: string, seats: string) {
  const user = userEvent.setup();
  const nameInput = screen.getByLabelText('Class name');
  const seatsInput = screen.getByLabelText('Total seats');
  await user.clear(nameInput);
  if (name) await user.type(nameInput, name);
  await user.clear(seatsInput);
  if (seats) await user.type(seatsInput, seats);
  return user;
}

describe('CreateClassPage', () => {
  it('has accessible labels for both inputs', () => {
    mockApi({});
    renderForm();
    expect(screen.getByLabelText('Class name')).toHaveAttribute('name', 'name');
    expect(screen.getByLabelText('Total seats')).toHaveAttribute('type', 'number');
  });

  it.each([
    ['', '', 'Enter a class name.', 'Enter the total number of seats.'],
    ['   ', '0', 'Enter a class name.', 'A class needs at least 1 seat.'],
    [
      'x'.repeat(101),
      '10001',
      'Use at most 100 characters (currently 101).',
      'Use at most 10,000 seats.',
    ],
  ])(
    'validates name %j and seats %j without calling the API',
    async (name, seats, nameError, seatsError) => {
      const { calls } = mockApi({});
      renderForm();
      const user = await fill(name, seats);

      await user.click(screen.getByRole('button', { name: 'Create class' }));

      expect(screen.getByText(nameError)).toBeInTheDocument();
      expect(screen.getByText(seatsError)).toBeInTheDocument();
      expect(screen.getByLabelText('Class name')).toHaveAttribute('aria-invalid', 'true');
      expect(calls).toHaveLength(0);
    },
  );

  it('posts the normalised class, disables submit while saving and shows success', async () => {
    let resolve!: (r: Response) => void;
    const { calls } = mockApi({
      'POST /classes': () => new Promise<Response>((r) => (resolve = r)),
    });
    renderForm();
    const user = await fill('  Class   8 ', '40');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    const saving = await screen.findByRole('button', { name: 'Creating…' });
    expect(saving).toBeDisabled();
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/classes',
      body: { name: 'Class 8', totalSeats: 40 },
    });
    expect(calls[0]!.headers['x-student-id']).toBeUndefined();

    resolve(json(201, created));

    expect(await screen.findByText('Class created')).toBeInTheDocument();
    expect(screen.getByText(/“Class 8” is open with 40 seats/)).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create class' })).toBeEnabled();
  });

  it('shows a duplicate name on the name field', async () => {
    mockApi({
      'POST /classes': () =>
        problem(409, 'CLASS_NAME_TAKEN', 'A class named "Class 8" already exists'),
    });
    renderForm();
    const user = await fill('Class 8', '40');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('A class with this name already exists.')).toBeInTheDocument();
    expect(screen.queryByText('Class created')).not.toBeInTheDocument();
  });

  it('maps server validation errors to the matching field', async () => {
    mockApi({
      'POST /classes': () =>
        problem(400, 'VALIDATION_ERROR', 'Validation failed', {
          name: ['name must not contain control or invisible formatting characters'],
        }),
    });
    renderForm();
    const user = await fill('Class 9', '10');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(
      await screen.findByText('name must not contain control or invisible formatting characters'),
    ).toBeInTheDocument();
  });

  it('shows an error message when the API is unreachable', async () => {
    mockApi({ 'POST /classes': () => Promise.reject(new TypeError('Failed to fetch')) });
    renderForm();
    const user = await fill('Class 9', '10');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Could not create class')).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveValue('Class 9');
  });

  it('refreshes the class list immediately after a class is created', async () => {
    const { calls } = mockApi({
      'GET /classes': [
        () => json(200, []),
        () =>
          json(200, [
            { ...created, heldSeats: 0, confirmedSeats: 0, availableSeats: created.totalSeats },
          ]),
      ],
      'POST /classes': () => json(201, created),
    });
    renderRoutes([
      {
        path: '/',
        element: (
          <>
            <CreateClassPage />
            <ClassListPage />
          </>
        ),
      },
    ]);
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();

    const user = await fill('Class 8', '40');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(
      await screen.findByRole('article', { name: 'Class 8' }, { timeout: 1500 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2),
    );
  });
});
