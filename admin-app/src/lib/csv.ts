import type { Student } from '../types';
import { testStatusLabel, type DerivedStatus } from './status';

export function exportStudentsCsv(students: Student[], statusOf: (id: string) => DerivedStatus) {
  const header = ['الاسم', 'رقم الهوية', 'الجوال', 'الحالة', 'تاريخ التسجيل'];
  const rows = students.map((s) => [
    s.name,
    s.code,
    s.phone || '',
    testStatusLabel(statusOf(s.id)),
    s.created_at,
  ]);
  const csvLines = [header, ...rows].map((row) =>
    row
      .map((cell) => {
        const str = String(cell ?? '');
        if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
      })
      .join(','),
  );
  const csv = '﻿' + csvLines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `الطلاب-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
