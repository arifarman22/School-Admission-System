import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { useCreateHold, useMyHolds } from '../../hooks/useHolds';
import { useStudentId } from '../../hooks/useStudentId';
import { getErrorMessage } from '../../utils/errors';
import { routes, STUDENT_ID_INPUT_ID } from '../../utils/routes';
import { Button } from '../common/Button';

interface ApplyButtonProps {
  classId: string;
  className: string;
  full?: boolean;
}

function ExistingApplicationLink({ classId }: { classId: string }) {
  const myHolds = useMyHolds();
  const active = myHolds.data?.find(
    (h) => h.classId === classId && (h.status === 'HELD' || h.status === 'CONFIRMED'),
  );
  return (
    <Link
      to={active ? routes.application(active.holdId) : routes.myApplications}
      className="font-medium underline underline-offset-2"
    >
      {active ? 'View your application' : 'View my applications'}
    </Link>
  );
}

export function ApplyButton({ classId, className, full = false }: ApplyButtonProps) {
  const { studentId } = useStudentId();
  const createHold = useCreateHold();
  const navigate = useNavigate();
  const [needsIdentity, setNeedsIdentity] = useState(false);

  const apply = () => {
    if (createHold.isPending) return;
    if (!studentId) {
      setNeedsIdentity(true);
      document.getElementById(STUDENT_ID_INPUT_ID)?.focus();
      return;
    }
    setNeedsIdentity(false);
    createHold.mutate(classId, {
      onSuccess: (hold) => navigate(routes.application(hold.holdId)),
    });
  };

  const error = createHold.error;
  const code = error instanceof ApiError ? error.code : null;
  const conflict = error instanceof ApiError && error.status === 409;

  return (
    <div className="space-y-2">
      {full ? (
        <p
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-medium text-rose-700"
          role="note"
        >
          This class is full. No seats are available right now.
        </p>
      ) : (
        <Button
          className="w-full"
          onClick={apply}
          loading={createHold.isPending}
          aria-label={`Apply now for ${className}`}
        >
          {createHold.isPending ? 'Holding a seat…' : 'Apply Now'}
        </Button>
      )}

      {needsIdentity && !studentId && !full && (
        <p role="alert" className="text-xs text-rose-600">
          Enter your 17-digit birth registration number at the top of the page first.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className={`rounded-lg border px-3 py-2 text-xs ${
            conflict
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {code === 'SEATS_FULL' && 'Seats are unavailable: this class just filled up.'}
          {code === 'DUPLICATE_APPLICATION' && (
            <>
              You already have an active application for this class.{' '}
              <ExistingApplicationLink classId={classId} />
            </>
          )}
          {conflict &&
            code !== 'SEATS_FULL' &&
            code !== 'DUPLICATE_APPLICATION' &&
            'Seats are unavailable or you already have an active application for this class.'}
          {!conflict && getErrorMessage(error)}
        </div>
      )}
    </div>
  );
}
