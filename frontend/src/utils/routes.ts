export const routes = {
  home: '/',
  classes: '/classes',
  admission: (classId: string) => `/classes/${encodeURIComponent(classId)}/apply`,
  myApplications: '/me/applications',
  createClass: '/admin/classes/new',
} as const;
