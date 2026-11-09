import { useState } from 'react';
import { useStudentId } from '../../hooks/useStudentId';
import { maskStudentId } from '../../utils/studentId';
import { Button } from '../common/Button';
import { StudentIdForm } from './StudentIdForm';

export function StudentIdentityBar() {
  const { studentId, clearStudentId } = useStudentId();
  const [editing, setEditing] = useState(false);

  if (!studentId) return null;

  return (
    <div className="border-b border-indigo-100 bg-indigo-50/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {editing ? (
          <div className="w-full sm:max-w-xl">
            <StudentIdForm
              submitLabel="Save"
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
              autoFocus
            />
          </div>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>Applying as</span>
              <span
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-mono text-sm tracking-wider text-slate-900"
                title={studentId}
              >
                {maskStudentId(studentId)}
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Change
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearStudentId}
                title="Use a different student"
              >
                Not you? Clear
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
