export const queryKeys = {
  classes: {
    all: ['classes'] as const,
    list: () => [...queryKeys.classes.all, 'list'] as const,
    detail: (classId: number) => [...queryKeys.classes.all, 'detail', classId] as const,
  },
  holds: {
    all: ['holds'] as const,
    detail: (holdId: string) => [...queryKeys.holds.all, 'detail', holdId] as const,
    mine: (studentId: string) => [...queryKeys.holds.all, 'mine', studentId] as const,
  },
};
