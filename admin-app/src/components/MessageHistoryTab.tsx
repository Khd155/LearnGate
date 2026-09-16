import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ClockIcon } from './Icons';

interface LogRow {
  id: string;
  student_name: string;
  phone: string;
  template_name: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  student_account_access_template_1: 'إشعار الحساب وبيانات الدخول',
  student_general_message: 'رسالة عامة',
  student_issue_notification: 'إشعار مشكلة/ملاحظة',
  student_request_declined: 'إشعار رفض طلب انضمام',
};

export default function MessageHistoryTab() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ logs: LogRow[] }>('/sendpulse/logs?limit=100')
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <ClockIcon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">سجل المراسلات المباشرة والعمليات</h3>
      </div>
      {!logs?.length ? (
        <p className="py-12 text-center text-sm text-slate-400">لا توجد رسائل مسجّلة بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-2.5 font-medium">الطالب</th>
                <th className="px-5 py-2.5 font-medium">الجوال</th>
                <th className="px-5 py-2.5 font-medium">القالب</th>
                <th className="px-5 py-2.5 font-medium">الحالة</th>
                <th className="px-5 py-2.5 font-medium">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{l.student_name || '—'}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{l.phone || '—'}</td>
                  <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{TEMPLATE_LABELS[l.template_name] || l.template_name}</td>
                  <td className="px-5 py-2.5">
                    {l.status === 'sent' ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        أُرسلت
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                        title={l.error_message || ''}
                      >
                        فشلت
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-400">{new Date(l.created_at).toLocaleString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
