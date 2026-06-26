import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useDebounce } from '../lib/useDebounce';
import { exportStudentsCsv } from '../lib/csv';
import { api } from '../lib/api';
import { resetStudentTest } from '../lib/students';
import type { DerivedStatus } from '../lib/status';
import type { Student } from '../types';
import FiltersBar, { type SortKey } from './FiltersBar';
import StudentRow from './StudentRow';
import AddStudentModal from './AddStudentModal';
import StudentModal from './StudentModal';
import ConfirmDialog from './ConfirmDialog';

const PAGE_SIZE = 20;

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-xl" />
      ))}
    </div>
  );
}

export default function StudentsTable() {
  const students = useStore((s) => s.students);
  const loadingCore = useStore((s) => s.loadingCore);
  const coreError = useStore((s) => s.coreError);
  const loadCore = useStore((s) => s.loadCore);
  const statusOf = useStore((s) => s.statusOf);
  const removeStudents = useStore((s) => s.removeStudents);
  const pushToast = useStore((s) => s.pushToast);
  const setTab = useStore((s) => s.setTab);
  const setBroadcastPrefillIds = useStore((s) => s.setBroadcastPrefillIds);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [statusFilter, setStatusFilter] = useState<DerivedStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [openStudent, setOpenStudent] = useState<Student | null>(null);

  const [resetTarget, setResetTarget] = useState<Student | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = students.filter((s) => {
      if (statusFilter !== 'all' && statusOf(s.id) !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
      const order: Record<DerivedStatus, number> = { not_started: 0, started: 1, finished: 2 };
      return order[statusOf(a.id)] - order[statusOf(b.id)];
    });
    return list;
  }, [students, debouncedSearch, statusFilter, sort, statusOf]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((s) => next.has(s.id));
      pageItems.forEach((s) => (allSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  };

  const goMessage = (student: Student) => {
    setConversationFocusStudentId(student.id);
    setTab('conversations');
  };

  const doReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetStudentTest(resetTarget.id);
      pushToast('success', `تم السماح لـ ${resetTarget.name} بإعادة الاختبار`);
      setResetTarget(null);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إعادة تعيين الاختبار');
    } finally {
      setResetting(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${deleteTarget.id}`);
      removeStudents([deleteTarget.id]);
      pushToast('success', `تم حذف ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل حذف الطالب');
    } finally {
      setDeleting(false);
    }
  };

  const doBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let okCount = 0;
    for (const id of ids) {
      try {
        await api.delete(`/students/${id}`);
        okCount++;
      } catch {
        /* continue with remaining */
      }
    }
    removeStudents(ids);
    setSelected(new Set());
    setBulkDeleteOpen(false);
    setBulkDeleting(false);
    pushToast(okCount === ids.length ? 'success' : 'error', `تم حذف ${okCount} من ${ids.length} طالب`);
  };

  const broadcastSelected = () => {
    setBroadcastPrefillIds(Array.from(selected));
    setTab('broadcast');
  };

  if (loadingCore) return <TableSkeleton />;

  if (coreError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-800 dark:bg-rose-950/40">
        <p className="text-rose-700 dark:text-rose-300">{coreError}</p>
        <button
          type="button"
          onClick={loadCore}
          className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FiltersBar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilter={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        sort={sort}
        onSort={setSort}
        onAdd={() => setAddOpen(true)}
        onExport={() => exportStudentsCsv(filtered, statusOf)}
      />

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/40">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            تم تحديد {selected.size} طالب
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={broadcastSelected}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-slate-800 dark:text-indigo-300"
            >
              📢 بث للمحددين
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400"
            >
              🗑️ حذف المحددين
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-white dark:text-slate-400"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-right">
          <thead>
            <tr className="border-b border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={pageItems.length > 0 && pageItems.every((s) => selected.has(s.id))}
                  onChange={toggleSelectAllOnPage}
                  className="h-4 w-4 rounded"
                />
              </th>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">رقم الهوية</th>
              <th className="px-4 py-3 font-medium">الجوال</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  لا يوجد طلاب مطابقون
                </td>
              </tr>
            ) : (
              pageItems.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  status={statusOf(s.id)}
                  selected={selected.has(s.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setOpenStudent}
                  onResetTest={setResetTarget}
                  onDelete={setDeleteTarget}
                  onMessage={goMessage}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            السابق
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            صفحة {page} من {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            التالي
          </button>
        </div>
      )}

      <AddStudentModal open={addOpen} onOpenChange={setAddOpen} />
      <StudentModal student={openStudent} onOpenChange={(o) => !o && setOpenStudent(null)} onMessage={goMessage} />

      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        title="السماح بإعادة الاختبار؟"
        description={`سيمكن ${resetTarget?.name || ''} من إعادة الاختبار الآن دون حذف نتائجه السابقة.`}
        confirmLabel="سماح"
        loading={resetting}
        onConfirm={doReset}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف الطالب؟"
        description={`سيتم حذف ${deleteTarget?.name || ''} نهائياً. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="حذف الطلاب المحددين؟"
        description={`سيتم حذف ${selected.size} طالب نهائياً. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="حذف الجميع"
        danger
        loading={bulkDeleting}
        onConfirm={doBulkDelete}
      />
    </div>
  );
}
