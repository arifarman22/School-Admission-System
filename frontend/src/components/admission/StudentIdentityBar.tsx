import { useState, type FormEvent } from 'react';
import { useStudentId } from '../../hooks/useStudentId';
import {
  maskStudentId,
  normalizeStudentId,
  STUDENT_ID_LENGTH,
  studentIdError,
} from '../../utils/studentId';
import { Button } from '../common/Button';
import { TextField } from '../common/TextField';

export function StudentIdentityBar() {
  const { studentId, setStudentId, clearStudentId } = useStudentId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const showForm = editing || !studentId;

  const startEditing = () => {
    setDraft(studentId ?? '');
    setError(null);
    setEditing(true);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = studentIdError(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setStudentId(normalizeStudentId(draft));
    setEditing(false);
    setDraft('');
  };

  return (
    <div className="border-b border-indigo-100 bg-indigo-50/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="text-sm">
          <p className="font-medium text-slate-800">Student identity</p>
          <p className="text-xs text-slate-600">
            {studentId && !editing
              ? 'Applications are made with this birth registration number.'
              : `Enter your ${STUDENT_ID_LENGTH}-digit birth registration number to apply.`}
          </p>
        </div>

        {showForm ? (
          <form
            onSubmit={onSubmit}
            noValidate
            className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start"
          >
            <TextField
              label="Birth registration number"
              hideLabel
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              error={error}
              inputMode="numeric"
              autoComplete="off"
              placeholder={'0'.repeat(STUDENT_ID_LENGTH)}
              maxLength={STUDENT_ID_LENGTH + 4}
              className="sm:w-64"
            />
            <div className="flex gap-2">
              <Button type="submit" size="md">
                Save
              </Button>
              {studentId && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-mono text-sm tracking-wider text-slate-800"
              title={studentId ?? undefined}
            >
              {maskStudentId(studentId!)}
            </span>
            <Button variant="secondary" size="sm" onClick={startEditing}>
              Change
            </Button>
            <Button variant="ghost" size="sm" onClick={clearStudentId}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
