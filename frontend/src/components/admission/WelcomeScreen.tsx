import { Link } from 'react-router';
import { routes } from '../../utils/routes';
import { STUDENT_ID_LENGTH } from '../../utils/studentId';
import { StudentIdForm } from './StudentIdForm';

const steps = [
  {
    title: 'Choose a class',
    text: 'Pick the class and shift you want and press Apply Now. Seats go to whoever applies first.',
  },
  {
    title: 'Your seat is held for you',
    text: 'A seat is reserved in the student’s name for a few minutes while you pay the admission fee. A timer shows the time left.',
  },
  {
    title: 'Confirm admission',
    text: 'Press Confirm Admission before the timer ends. If time runs out, the seat goes to the next applicant.',
  },
];

export function WelcomeScreen() {
  return (
    <section aria-labelledby="welcome-title" className="mx-auto max-w-3xl space-y-8">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wide text-indigo-600 uppercase">
          Online admission
        </p>
        <h1
          id="welcome-title"
          className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
        >
          Welcome! Let’s start the admission
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">
          Enter the student’s {STUDENT_ID_LENGTH}-digit birth registration number. We use it to hold
          seats and keep track of the student’s applications.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <StudentIdForm submitLabel="Continue" size="lg" autoFocus />
        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="mt-0.5 size-4 shrink-0 fill-current"
          >
            <path d="M10 1a5 5 0 0 0-5 5v2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 7H7V6a3 3 0 0 1 6 0v2Z" />
          </svg>
          The number is saved only in this browser so you don’t need to type it again. You can
          change it at any time.
        </p>
      </div>

      <div>
        <h2 className="text-center text-sm font-semibold tracking-wide text-slate-500 uppercase">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <p className="mt-3 font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-sm text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-center text-sm text-slate-500">
        School administrator?{' '}
        <Link to={routes.createClass} className="font-medium text-indigo-600 underline">
          Go to the admin panel
        </Link>
      </p>
    </section>
  );
}
