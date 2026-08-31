import type { Student } from '../types';
import { testStatusLabel, type DerivedStatus } from './status';

// Formats an ISO timestamp (e.g. "2026-06-25T00:57:13.040Z") down to a plain
// Gregorian YYYY-MM-DD — what admins actually want to read in a spreadsheet,
// not the raw ISO string. Falls back to the original string if it isn't a
// parseable date, so a malformed value never disappears silently.
function toPlainDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// Renders as an HTML <table> saved with an .xls extension — Excel opens this
// natively as a real worksheet (merged cells, per-cell number formats), which
// a plain-delimited CSV can't express and which Excel's own CSV importer
// frequently mangles under Arabic/Gulf regional settings (defaulting to ';'
// as the list separator, dumping every field into column A).
export function exportStudentsXls(students: Student[], statusOf: (id: string) => DerivedStatus) {
  const headers = ['الاسم', 'رقم الهوية', 'الجوال', 'الحالة', 'تاريخ التسجيل'];
  const todayStr = new Date().toISOString().slice(0, 10);

  // mso-number-format:"\@" forces Excel to treat the cell as Text — without
  // it, a national ID or phone number starting with "0" gets silently
  // reinterpreted as a number and loses its leading zero.
  const textCell = (value: string) =>
    `<td style="mso-number-format:'\\@';text-align:right;">${escapeHtml(value)}</td>`;
  const cell = (value: string) => `<td style="text-align:right;">${escapeHtml(value)}</td>`;

  const headerRow = `<tr>${headers.map((h) => `<td style="font-weight:bold;background:#E2E8F0;text-align:center;">${escapeHtml(h)}</td>`).join('')}</tr>`;

  const dataRows = students
    .map((s) => {
      const cells = [
        cell(s.name || ''),
        textCell(s.code || ''),
        textCell(s.phone || ''),
        cell(testStatusLabel(statusOf(s.id))),
        cell(toPlainDate(s.created_at)),
      ];
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Tahoma,Arial,sans-serif;font-size:13px;direction:rtl;}td{border:1px solid #CBD5E1;padding:6px 10px;}</style></head>
<body>
<table>
<tr><td colspan="5" rowspan="3" style="text-align:center;font-weight:bold;font-size:18px;background:#0F172A;color:#FFFFFF;padding:16px;">بوابة دعم التعلم</td></tr>
<tr></tr>
<tr></tr>
${headerRow}
${dataRows}
<tr><td colspan="5" style="text-align:center;font-style:italic;color:#475569;">تاريخ التصدير: ${todayStr}</td></tr>
</table>
</body>
</html>`;

  // UTF-8 BOM so Excel renders the Arabic text correctly instead of mojibake.
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `الطلاب-${todayStr}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
