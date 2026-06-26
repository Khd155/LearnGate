import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useStore } from '../store/useStore';

const STATUS_COLORS = ['#10b981', '#f59e0b', '#94a3b8'];

function formatDay(date: unknown) {
  const d = new Date(String(date));
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

export default function ChartsSection() {
  const stats = useStore((s) => s.stats);
  const statsLoading = useStore((s) => s.statsLoading);
  const dark = useStore((s) => s.dark);

  const gridColor = dark ? '#1e293b' : '#e2e8f0';
  const textColor = dark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: dark ? '#0f172a' : '#fff',
    border: `1px solid ${gridColor}`,
    borderRadius: 8,
    fontSize: 12,
    direction: 'rtl' as const,
  };

  if (statsLoading && !stats) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-2xl lg:col-span-2" />
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (!stats) return null;

  const statusData = [
    { name: 'انتهى', value: stats.statusDistribution.finished },
    { name: 'بدأ', value: stats.statusDistribution.started },
    { name: 'لم يبدأ', value: stats.statusDistribution.notStarted },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">📈 النشاط اليومي (آخر 14 يوم)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.dailyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDay} stroke={textColor} fontSize={12} />
            <YAxis stroke={textColor} fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDay} />
            <Legend />
            <Line type="monotone" dataKey="logins" name="تسجيلات دخول" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="tests" name="اختبارات" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="tickets" name="تذاكر دعم" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">🎯 متوسط الأداء حسب المهارة</h3>
        {stats.skillAverages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">لا توجد بيانات كافية</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.skillAverages} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis type="number" domain={[0, 100]} stroke={textColor} fontSize={12} />
              <YAxis type="category" dataKey="skill" width={120} stroke={textColor} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Bar dataKey="avgPct" name="المتوسط" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">📊 توزيع حالة الاختبار</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {statusData.map((_, i) => (
                <Cell key={i} fill={STATUS_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
