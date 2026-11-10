import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AdmissionClass } from '../types/api';
import { json, mockApi, problem, renderRoutes } from '../test/utils';
import { ClassListPage } from './ClassListPage';
import { CreateClassPage } from './CreateClassPage';

const created = { id: 8, name: 'Class 8', section: 'A', totalSeats: 40 };

const existing = (id: number, name: string, section: string): AdmissionClass => ({
  id,
  name,
  section,
  totalSeats: 30,
  heldSeats: 0,
  confirmedSeats: 0,
  availableSeats: 30,
});

function renderForm() {
  return renderRoutes([{ path: '/admin/classes/new', element: <CreateClassPage /> }]);
}

async function fill(name: string, section: string, seats: string) {
  const user = userEvent.setup();
  const nameInput = screen.getByLabelText('Class name');
  const sectionInput = screen.getByLabelText('Section');
  const seatsInput = screen.getByLabelText('Total seats');
  await user.clear(nameInput);
  if (name) await user.type(nameInput, name);
  await user.clear(sectionInput);
  if (section) await user.type(sectionInput, section);
  await user.clear(seatsInput);
  if (seats) await user.type(seatsInput, seats);
  return user;
}

describe('CreateClassPage', () => {
  it('has accessible labels for every input', () => {
    mockApi({ 'GET /classes': () => json(200, []) });
    renderForm();
    expect(screen.getByLabelText('Class name')).toHaveAttribute('name', 'name');
    expect(screen.getByLabelText('Section')).toHaveAttribute('name', 'section');
    expect(screen.getByLabelText('Total seats')).toHaveAttribute('type', 'number');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it.each([
    [
      '',
      '',
      '',
      'Enter a class name.',
      'Enter a section, for example A.',
      'Enter the total number of seats.',
    ],
    [
      '   ',
      '!',
      '0',
      'Enter a class name.',
      'Use only letters, numbers, spaces and hyphens.',
      'A class needs at least 1 seat.',
    ],
    [
      'x'.repeat(101),
      'x'.repeat(21),
      '10001',
      'Use at most 100 characters (currently 101).',
      'Use at most 20 characters (currently 21).',
      'Use at most 10,000 seats.',
    ],
  ])(
    'validates name %j, section %j and seats %j without calling the API',
    async (name, section, seats, nameError, sectionError, seatsError) => {
      const { calls } = mockApi({ 'GET /classes': () => json(200, []) });
      renderForm();
      const user = await fill(name, section, seats);

      await user.click(screen.getByRole('button', { name: 'Create class' }));

      expect(screen.getByText(nameError)).toBeInTheDocument();
      expect(screen.getByText(sectionError)).toBeInTheDocument();
      expect(screen.getByText(seatsError)).toBeInTheDocument();
      expect(screen.getByLabelText('Class name')).toHaveAttribute('aria-invalid', 'true');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    },
  );

  it('posts the normalised class and section, disables submit while saving and shows success', async () => {
    let resolve!: (r: Response) => void;
    const { calls } = mockApi({
      'GET /classes': () => json(200, []),
      'POST /classes': () => new Promise<Response>((r) => (resolve = r)),
    });
    renderForm();
    const user = await fill('  Class   8 ', ' a ', '40');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    const saving = await screen.findByRole('button', { name: 'Creating…' });
    expect(saving).toBeDisabled();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post).toMatchObject({
      path: '/classes',
      body: { name: 'Class 8', section: 'A', totalSeats: 40 },
    });
    expect(post.headers['x-student-id']).toBeUndefined();

    resolve(json(201, created));

    expect(await screen.findByText('Class created')).toBeInTheDocument();
    expect(screen.getByText(/“Class 8” section A is open with 40 seats/)).toBeInTheDocument();
    expect(screen.getByLabelText('Class name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create class' })).toBeEnabled();
  });

  it('lists existing sections and blocks a duplicate section before calling the API', async () => {
    const { calls } = mockApi({
      'GET /classes': () =>
        json(200, [
          existing(1, 'Class 1', 'A'),
          existing(2, 'Class 1', 'B'),
          existing(3, 'Class 2', 'A'),
        ]),
    });
    renderForm();
    await screen.findByText('Enter a class name to see the sections it already has.');
    const user = await fill('class 1', 'a', '30');

    const table = within(screen.getByRole('region', { name: 'Existing sections' })).getByRole(
      'table',
    );
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Section A already exists for class 1.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Section A (already exists)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Section B (already exists)' })).toBeDisabled();
    expect(screen.getByText(/next free section is C/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Section C' }));
    expect(screen.getByLabelText('Section')).toHaveValue('C');
    expect(screen.queryByText(/already exists for/)).not.toBeInTheDocument();
  });

  it('shows a server-side duplicate section on the section field', async () => {
    mockApi({
      'GET /classes': () => json(200, []),
      'POST /classes': () =>
        problem(409, 'CLASS_SECTION_TAKEN', 'Section "A" of "Class 8" already exists'),
    });
    renderForm();
    const user = await fill('Class 8', 'A', '40');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Section A already exists for Class 8.')).toBeInTheDocument();
    expect(screen.getByLabelText('Section')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Class created')).not.toBeInTheDocument();
  });

  it('prefills the next free section when adding another section', async () => {
    mockApi({
      'GET /classes': [() => json(200, []), () => json(200, [existing(8, 'Class 8', 'A')])],
      'POST /classes': () => json(201, created),
    });
    renderForm();
    const user = await fill('Class 8', 'A', '40');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await user.click(await screen.findByRole('button', { name: 'Add another section' }));

    expect(screen.getByLabelText('Class name')).toHaveValue('Class 8');
    expect(screen.getByLabelText('Section')).toHaveValue('B');
    expect(screen.getByLabelText('Total seats')).toHaveValue(null);
  });

  it('maps server validation errors to the matching field', async () => {
    mockApi({
      'GET /classes': () => json(200, []),
      'POST /classes': () =>
        problem(400, 'VALIDATION_ERROR', 'Validation failed', {
          name: ['name must not contain control or invisible formatting characters'],
          section: ['section is too long'],
        }),
    });
    renderForm();
    const user = await fill('Class 9', 'A', '10');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(
      await screen.findByText('name must not contain control or invisible formatting characters'),
    ).toBeInTheDocument();
    expect(screen.getByText('section is too long')).toBeInTheDocument();
  });

  it('still allows creating when existing classes cannot be loaded', async () => {
    const { calls } = mockApi({
      'GET /classes': () => problem(503, 'SERVICE_UNAVAILABLE'),
      'POST /classes': () => json(201, created),
    });
    renderForm();
    expect(
      await screen.findByText(/Existing classes could not be loaded/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    const user = await fill('Class 8', 'A', '40');

    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Class created')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('shows an error message when the API is unreachable', async () => {
    mockApi({
      'GET /classes': () => json(200, []),
      'POST /classes': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    renderForm();
    const user = await fill('Class 9', 'A', '10');

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

    const user = await fill('Class 8', 'A', '40');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(
      await screen.findByRole('article', { name: 'Class 8' }, { timeout: 1500 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2),
    );
  });
});
