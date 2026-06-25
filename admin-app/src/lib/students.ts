import { api } from './api';

export function resetStudentTest(studentId: string) {
  return api.post<{ ok: true; deleted: number }>(`/students/${studentId}/reset-test`);
}
