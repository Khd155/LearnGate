import { useCallback, useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useStore } from '../store/useStore';
import type { ChemAlert, ChemSupervisorOverview } from '../types';
import { AtomIcon, BarsIcon, BellIcon, BoltIcon, CheckIcon, ClockIcon, TrophyIcon } from './Icons';

// Chemistry-1 prerequisite analytics for supervisors. One request feeds all
// four sub-tabs; "تدخّل" writes to the student through the same /messages
// channel the conversations tab uses (payload key is `studentId`).

const SUBJECT = 'chemistry-1';
type SubTab = 'alerts' | 'top' | 'engaged' | 'gaps';
type AlertFilter = 'all' | 'open' | 'done';

const CARD =
  'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6';

// Arabic counted plurals: 3–10 take the plural noun, 11+ the singular accusative.
function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return `قبل ${one}`;
  if (n === 2) return `قبل ${two}`;
  return `قبل ${n} ${n <= 10 ? few : many}`;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'الآن';
  if (m < 60) return unit(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const h = Math.round(m / 60);
  if (h < 24) return unit(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const d = Math.round(h / 24);
  return d === 1 ? 'أمس' : unit(d, 'يوم', 'يومين', 'أيام', 'يوماً');
}

// 1 → singular, 2 → dual, 3–10 → plural, 11+ → accusative singular.
function plural(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n <= 10 ? few : many}`;
}

function draftMessage(a: ChemAlert): string {
  return `مرحباً ${a.name}، لاحظنا في «${a.scopeTitle}» أن لديك فجوة في: ${a.weakLabels.join('، ')}. ننصحك بمراجعتها قبل المتابعة، ونحن جاهزون لمساعدتك.`;
}

function Bar({ pct, tone }: { pct: number; tone: 'good' | 'warn' | 'danger' }) {
  const fill = { good: 'bg-emerald-500', warn: 'bg-amber-500', danger: 'bg-rose-500' }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="presentation">
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={CARD + ' !p-4'}>
      <div className={cn('text-2xl font-extrabold', tone ?? 'text-slate-900 dark:text-white')}>{value}</div>
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-300">{children}</div>;
}

export default function ChemistryAnalyticsTab() {
  const pushToast = useStore((s) => s.pushToast);
  const [data, setData] = useState<ChemSupervisorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubTab>('alerts');
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<ChemSupervisorOverview>(`/prereq/supervisor-overview?subject=${SUBJECT}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحميل التحليلات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const alertKey = (a: ChemAlert) => `${a.studentId}|${a.scope}|${a.chapterId ?? ''}`;

  const openCompose = (a: ChemAlert) => {
    const k = alertKey(a);
    if (composeFor === k) { setComposeFor(null); return; }
    setComposeFor(k);
    setDraft(draftMessage(a));
  };

  const send = async (a: ChemAlert) => {
    const body = draft.trim();
    if (!body) { pushToast('error', 'اكتب نص الرسالة أولاً'); return; }
    setSending(true);
    try {
      const session = useStore.getState().session;
      await api.post('/messages', { body, studentId: a.studentId, school: session?.school || a.school || '', recipientAdminId: session?.code || '' });
      pushToast('success', `تم إرسال رسالتك إلى ${a.name}`);
      setComposeFor(null);
      await load();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'تعذّر إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const triggerCls =
    'relative flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 data-[state=active]:font-bold data-[state=active]:text-indigo-700 dark:text-slate-300 dark:hover:text-white dark:data-[state=active]:text-indigo-300 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-indigo-600 dark:data-[state=active]:after:bg-indigo-400';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <AtomIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">تحليلات الكيمياء 1</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">فجوات المتطلبات القبلية ومؤشرات الأداء والجهد لطلاب المقرر</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ms-auto min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {loading ? 'جارٍ التحديث…' : 'تحديث'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          تعذّر تحميل التحليلات: {error}
        </div>
      )}
      {!data && loading && <Empty>جارٍ التحميل…</Empty>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="طلاب شُخّصوا" value={data.totals.studentsAssessed} />
            <Stat label="محاولات تشخيص" value={data.totals.attempts} />
            <Stat label="تنبيهات تحتاج تدخّلاً" value={data.totals.openAlerts} tone="text-rose-700 dark:text-rose-300" />
            <Stat label="تنبيهات إجمالية" value={data.totals.alerts} tone="text-amber-700 dark:text-amber-300" />
          </div>

          <Tabs.Root dir="rtl" value={sub} onValueChange={(v) => setSub(v as SubTab)}>
            <Tabs.List className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="أقسام تحليلات الكيمياء">
              <Tabs.Trigger value="alerts" className={triggerCls}>
                <BellIcon className="h-4 w-4" />التنبيهات
                <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold', data.totals.openAlerts ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}>{data.totals.openAlerts}</span>
              </Tabs.Trigger>
              <Tabs.Trigger value="top" className={triggerCls}><TrophyIcon className="h-4 w-4" />الأفضل أداءً</Tabs.Trigger>
              <Tabs.Trigger value="engaged" className={triggerCls}><BoltIcon className="h-4 w-4" />الأكثر تفاعلاً</Tabs.Trigger>
              <Tabs.Trigger value="gaps" className={triggerCls}><BarsIcon className="h-4 w-4" />تحليل الفجوات حسب الفصل</Tabs.Trigger>
            </Tabs.List>

            {/* ── alerts ── */}
            <Tabs.Content value="alerts" className={CARD}>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">تنبيهات الفجوات التراكمية</h3>
              <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">
                طلاب أخفقوا في أغلب متطلباتهم القبلية في آخر تشخيص لهم. يزول التنبيه تلقائياً إذا أعاد الطالب التشخيص وتجاوزه.
              </p>
              <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="تصفية التنبيهات">
                {([['all', 'الكل', data.alerts.length], ['open', 'تحتاج تدخّلاً', data.totals.openAlerts], ['done', 'تمت متابعتها', data.alerts.length - data.totals.openAlerts]] as [AlertFilter, string, number][]).map(([k, l, n]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                    className={cn('min-h-11 rounded-full border px-4 text-sm', filter === k ? 'border-indigo-500 bg-indigo-50 font-bold text-indigo-800 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200' : 'border-slate-300 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800')}
                  >
                    {l} <span className="font-bold">{n}</span>
                  </button>
                ))}
              </div>
              {(() => {
                const rows = data.alerts.filter((a) => filter === 'all' || (filter === 'open' ? !a.followedUp : a.followedUp));
                if (!rows.length) return <Empty>{data.alerts.length ? 'لا توجد تنبيهات في هذا التصنيف' : 'لا توجد تنبيهات حالياً — لا فجوات تراكمية مسجلة'}</Empty>;
                return (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rows.map((a) => {
                      const k = alertKey(a);
                      const crit = a.severity === 'critical';
                      return (
                        <li key={k} className={cn('flex flex-wrap items-start gap-4 py-5', a.followedUp && 'opacity-90')}>
                          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-extrabold text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">{(a.name || '؟').charAt(0)}</span>
                          <div className="min-w-[14rem] flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-extrabold text-slate-900 dark:text-white">{a.name}</span>
                              <span className={cn('rounded-full px-3 py-0.5 text-xs font-bold', crit ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200')}>
                                {crit ? 'حرج' : 'متوسط'} · أخفق في {a.weakCount} من {a.totalCount}
                              </span>
                              <span className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"><ClockIcon className="h-4 w-4" />{ago(a.createdAt)}</span>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-300">{a.scopeTitle}{a.school ? ` · ${a.school}` : ''}</div>
                            <div className="flex flex-wrap gap-2">
                              {a.weakLabels.map((l) => (
                                <span key={l} className={cn('rounded-full border px-3 py-1 text-sm font-semibold', crit ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100')}>{l}</span>
                              ))}
                            </div>
                          </div>
                          {a.followedUp ? (
                            <span className="flex min-h-11 items-center gap-2 self-center rounded-xl bg-emerald-50 px-4 text-sm font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"><CheckIcon className="h-4 w-4" />تمت المتابعة</span>
                          ) : (
                            <button type="button" onClick={() => openCompose(a)} aria-expanded={composeFor === k} className="min-h-11 self-center rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700 dark:bg-indigo-400 dark:text-slate-950 dark:hover:bg-indigo-300">
                              تدخّل
                            </button>
                          )}
                          {composeFor === k && (
                            <div className="basis-full rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                              <label htmlFor={`msg-${k}`} className="sr-only">رسالة إلى {a.name}</label>
                              <textarea id={`msg-${k}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-7 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                <span className="me-auto text-xs text-slate-600 dark:text-slate-300">تصل الرسالة للطالب في محادثته — عدّلها قبل الإرسال.</span>
                                <button type="button" onClick={() => setComposeFor(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">إلغاء</button>
                                <button type="button" disabled={sending} onClick={() => send(a)} className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-400 dark:text-slate-950">{sending ? 'جارٍ الإرسال…' : 'إرسال للطالب'}</button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </Tabs.Content>

            {/* ── top performers ── */}
            <Tabs.Content value="top" className={CARD}>
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white"><TrophyIcon className="h-5 w-5 text-amber-600 dark:text-amber-300" />الأفضل أداءً</h3>
              <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">متوسط نسبة المتطلبات التي أجاب عنها الطالب صحيحاً في آخر تشخيص له لكل نطاق (المادة العامة والفصول).</p>
              {!data.topPerformers.length ? <Empty>لا توجد نتائج تشخيص بعد</Empty> : (
                <ol className="space-y-4">
                  {data.topPerformers.map((s, i) => (
                    <li key={s.studentId} className="flex items-center gap-4">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', i === 0 ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">{s.name}</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-300">{s.score}%</span>
                        </div>
                        <Bar pct={s.score} tone="good" />
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{plural(s.assessed, 'نطاق واحد مُشخَّص', 'نطاقان مُشخَّصان', 'نطاقات مُشخَّصة', 'نطاقاً مُشخَّصاً')}{s.school ? ` · ${s.school}` : ''}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Tabs.Content>

            {/* ── most engaged ── */}
            <Tabs.Content value="engaged" className={CARD}>
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white"><BoltIcon className="h-5 w-5 text-indigo-700 dark:text-indigo-300" />الأكثر تفاعلاً</h3>
              <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">مؤشر جهد مستقل عن الدرجة: عدد محاولات التشخيص التي أنجزها الطالب (بما فيها الإعادات).</p>
              {!data.mostEngaged.length ? <Empty>لا توجد محاولات بعد</Empty> : (() => {
                const max = Math.max(1, ...data.mostEngaged.map((s) => s.attempts));
                return (
                  <ol className="space-y-4">
                    {data.mostEngaged.map((s, i) => (
                      <li key={s.studentId} className="flex items-center gap-4">
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', i === 0 ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">{s.name}</span>
                            <span className="font-extrabold text-indigo-700 dark:text-indigo-300">{plural(s.attempts, 'محاولة واحدة', 'محاولتان', 'محاولات', 'محاولة')}</span>
                          </div>
                          <Bar pct={(s.attempts / max) * 100} tone="warn" />
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{plural(s.scopes, 'نطاق واحد', 'نطاقان', 'نطاقات', 'نطاقاً')} · آخر نشاط {ago(s.lastAt)}{s.school ? ` · ${s.school}` : ''}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </Tabs.Content>

            {/* ── gaps by chapter ── */}
            <Tabs.Content value="gaps">
              <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">لكل نطاق تشخيص: كم طالباً يعاني من كل متطلب قبلي (آخر تشخيص لكل طالب). النسب من 50% فما فوق بالأحمر.</p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.gapsByChapter.map((g) => (
                  <div key={g.key} className={CARD}>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{g.title}</h3>
                    <div className="mb-3 mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span>{g.assessed === 0 ? 'لا طلاب' : plural(g.assessed, 'طالب واحد', 'طالبان', 'طلاب', 'طالباً')}</span>
                      {g.alerts > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">{plural(g.alerts, 'تنبيه واحد', 'تنبيهان', 'تنبيهات', 'تنبيهاً')}</span>}
                    </div>
                    {!g.assessed ? <Empty>لم يُشخَّص أي طالب بعد</Empty>
                      : !g.gaps.length ? <Empty>لا فجوات — جميع الطلاب أجابوا صحيحاً</Empty>
                      : (
                        <ul className="space-y-3">
                          {g.gaps.map((x) => (
                            <li key={x.label}>
                              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                                <span className="font-semibold text-slate-900 dark:text-white">{x.label}</span>
                                <span className={cn('font-bold', x.pct >= 50 ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300')}>{x.count} من {g.assessed} · {x.pct}%</span>
                              </div>
                              <Bar pct={x.pct} tone={x.pct >= 50 ? 'danger' : 'warn'} />
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </div>
  );
}
