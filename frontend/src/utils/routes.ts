export const routes = {
  home: '/',
  classes: '/classes',
  application: (holdId: string) => `/applications/${encodeURIComponent(holdId)}`,
  myApplications: '/me/applications',
  createClass: '/admin/classes/new',
} as const;

export const STUDENT_ID_INPUT_ID = 'student-identity-input';
