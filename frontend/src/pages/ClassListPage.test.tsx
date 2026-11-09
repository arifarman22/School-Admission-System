import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, renderRoutes } from '../test/utils';
import type { AdmissionClass } from '../types/api';
import { ClassListPage } from './ClassListPage';

const morning: AdmissionClass = {
  id: 6,
  name: 'Class 6 - Morning Shift',
  totalSeats: 120,
  heldSeats: 15,
  confirmedSeats: 80,
  availableSeats: 25,
};

const fullClass: AdmissionClass = {
  id: 7,
  name: 'Class 7 - Day Shift',
  totalSeats: 40,
  heldSeats: 5,
  confirmedSeats: 35,
  availableSeats: 0,
};

const renderPage = () => renderRoutes([{ path: '/classes', element: <ClassListPage /> }]);

describe('ClassListPage', () => {
  it('shows every class with all seat counts and an Apply Now link', async () => {
    mockApi({ 'GET /classes': () => json(200, [morning]) });
    renderPage();

    const card = await screen.findByRole('article', { name: morning.name });
    const stat = (label: string) =>
      within(card).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(stat('Total')).toBe('120');
    expect(stat('Held')).toBe('15');
    expect(stat('Confirmed')).toBe('80');
    expect(stat('Available')).toBe('25');

    expect(
      within(card).getByRole('button', { name: `Apply now for ${morning.name}` }),
    ).toBeEnabled();
  });

  it('shows a full-class message instead of Apply Now when no seats are available', async () => {
    mockApi({ 'GET /classes': () => json(200, [fullClass]) });
    renderPage();

    const card = await screen.findByRole('article', { name: fullClass.name });
    expect(within(card).getByText(/this class is full/i)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no classes', async () => {
    mockApi({ 'GET /classes': () => json(200, []) });
    renderPage();

    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
  });

  it('shows a connection error with retry when the first load fails', async () => {
    const { calls } = mockApi({
      'GET /classes': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => json(200, [morning]),
      ],
    });
    renderPage();

    expect(await screen.findByText('Could not load classes')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the admission service/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: morning.name })).toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it('refreshes every 3 seconds and shows new availability', async () => {
    const updated = { ...morning, heldSeats: 16, availableSeats: 24 };
    mockApi({ 'GET /classes': [() => json(200, [morning]), () => json(200, [updated])] });
    renderPage();

    const card = await screen.findByRole('article', { name: morning.name });
    expect(within(card).getByText('25 seats available')).toBeInTheDocument();

    await waitFor(() => expect(within(card).getByText('24 seats available')).toBeInTheDocument(), {
      timeout: 4500,
    });
  }, 8000);

  it('warns that data is stale when a refresh fails instead of presenting it as current', async () => {
    mockApi({
      'GET /classes': [
        () => json(200, [morning]),
        () => Promise.reject(new TypeError('Failed to fetch')),
      ],
    });
    renderPage();

    await screen.findByRole('article', { name: morning.name });
    expect(screen.getByText('Live')).toBeInTheDocument();

    expect(
      await screen.findByText('Showing last known availability', {}, { timeout: 4500 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: morning.name })).toBeInTheDocument();
  }, 8000);

  it('does not start overlapping requests while a refresh is still in flight', async () => {
    let release!: () => void;
    const { calls } = mockApi({
      'GET /classes': [
        () => json(200, [morning]),
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(json(200, [morning]));
          }),
      ],
    });
    renderPage();
    await screen.findByRole('article', { name: morning.name });

    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 4500 });
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(calls).toHaveLength(2);

    release();
  }, 12000);
});
