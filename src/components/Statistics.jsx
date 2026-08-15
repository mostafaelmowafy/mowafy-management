// src/components/Statistics.jsx
// شاشة الإحصائيات — تقييم تراكمي لكل طالب:
// - تراكمي كلي: متوسط درجات كل الحصص المسجَّلة للطالب منذ البداية
// - تراكمي شهري: نفس المتوسط لكن مفلتر على شهر معيّن
// كل حساب يمر عبر src/lib/scoring.js (نفس معادلة شاشة "تقييم الحصة" بالضبط)
// حتى لا يظهر رقم مختلف عن الدرجة الحقيقية لأي حصة بعينها.

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, currentMonthStr } from "../db/db";
import { getStudentDailyScores, averageScore } from "../lib/scoring";
import { getDefaultTemplate, fillTemplate, buildWhatsAppLink as buildWaLink } from "../lib/whatsappTemplates";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function buildMonthOptions() {
  const now = new Date();
  const options = [];
  for (let offset = -6; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: `${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return options;
}

function formatDateArabic(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${ARABIC_MONTHS[month - 1]} ${year}`;
}

export default function Statistics({ onDone }) {
  const monthOptions = useMemo(buildMonthOptions, []);
  const [groupId, setGroupId] = useState("");
  const [month, setMonth] = useState(currentMonthStr());
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [rows, setRows] = useState(null); // null = جارِ التحميل
  const [loading, setLoading] = useState(false);

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  useEffect(() => {
    if (!groupId && activeGroups && activeGroups.length > 0) {
      setGroupId(String(activeGroups[0].id));
    }
  }, [activeGroups, groupId]);

  const numericGroupId = groupId ? Number(groupId) : null;

  const students = useLiveQuery(
    () =>
      numericGroupId
        ? db.students
            .where("groupId")
            .equals(numericGroupId)
            .and((s) => !s.isArchived)
            .toArray()
        : Promise.resolve([]),
    [numericGroupId],
    []
  );

  // حساب الإحصائيات لكل طلاب المجموعة — يتم في useEffect لأن الحساب غير متزامن
  // (بيمر على db.attendance/db.tasks/db.sessions لكل طالب) وليس مجرد استعلام مباشر
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!students || students.length === 0) {
        setRows([]);
        return;
      }
      setLoading(true);
      const computed = await Promise.all(
        students.map(async (student) => {
          const daily = await getStudentDailyScores(student.id, numericGroupId);
          return {
            student,
            daily,
            sessionsCount: daily.length,
            overallAverage: averageScore(daily),
            monthlyAverage: averageScore(daily, month),
          };
        })
      );
      if (!cancelled) {
        setRows(computed);
        setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [students, month, numericGroupId]);

  return (
    <div dir="rtl" className="min-h-screen bg-surface-alt font-sans text-primary">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">الإحصائيات</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-alt"
            >
              العودة
            </button>
          )}
        </header>

        {/* الفلاتر */}
        <div className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-edge bg-surface p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary">المجموعة</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-edge px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            >
              <option value="" disabled>
                اختر مجموعة...
              </option>
              {(activeGroups || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.groupName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary">
              الشهر (للتراكمي الشهري)
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-edge px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!numericGroupId && (
          <p className="rounded-xl border border-dashed border-edge bg-surface py-10 text-center text-sm text-muted">
            اختر مجموعة لعرض إحصائياتها.
          </p>
        )}

        {numericGroupId && loading && (
          <p className="rounded-xl border border-dashed border-edge bg-surface py-10 text-center text-sm text-muted">
            جارِ حساب الإحصائيات...
          </p>
        )}

        {numericGroupId && !loading && rows && rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-edge bg-surface py-10 text-center text-sm text-muted">
            لا يوجد طلاب نشطون في هذه المجموعة.
          </p>
        )}

        {/* قائمة الطلاب مع إحصائياتهم */}
        {numericGroupId && !loading && rows && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => (
              <StudentStatRow
                key={row.student.id}
                row={row}
                groupName={(activeGroups || []).find((g) => g.id === numericGroupId)?.groupName}
                monthLabel={monthOptions.find((m) => m.value === month)?.label}
                expanded={expandedStudentId === row.student.id}
                onToggle={() =>
                  setExpandedStudentId(expandedStudentId === row.student.id ? null : row.student.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// صف طالب واحد + تفاصيل قابلة للطي (يوماً بيوم)
// ========================================================================
function StudentStatRow({ row, groupName, monthLabel, expanded, onToggle }) {
  const { student, daily, sessionsCount, overallAverage, monthlyAverage } = row;
  const [showReport, setShowReport] = useState(false);

  const overallLink =
    student.parentPhone && overallAverage !== null
      ? buildCumulativeLink(student, groupName, "بشكل عام", overallAverage)
      : null;

  const monthlyLink =
    student.parentPhone && monthlyAverage !== null
      ? buildCumulativeLink(student, groupName, `لشهر ${monthLabel || ""}`, monthlyAverage)
      : null;

  return (
    <div className="rounded-2xl border border-edge bg-surface p-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-right"
      >
        <div>
          <p className="text-sm font-semibold text-primary">{student.name}</p>
          <p className="text-xs text-muted">{sessionsCount} حصة مُسجَّلة</p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <ScoreBadge label="تراكمي كلي" value={overallAverage} />
          <ScoreBadge label={monthLabel || "الشهر"} value={monthlyAverage} />
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReport(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-hover hover:bg-accent-soft"
        >
          <ReportIcon />
          تقرير
        </button>
        {overallLink && (
          <a
            href={overallLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <WhatsAppIcon />
            إرسال التراكمي الكلي
          </a>
        )}
        {monthlyLink && (
          <a
            href={monthlyLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <WhatsAppIcon />
            إرسال تراكمي {monthLabel}
          </a>
        )}
      </div>

      {expanded && (
        <div className="mt-3 border-t border-edge pt-3">
          {daily.length === 0 ? (
            <p className="text-xs text-faint">لا توجد حصص مسجَّلة بعد.</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {daily
                .slice()
                .reverse()
                .map((d) => (
                  <li
                    key={d.date}
                    className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-1.5 text-xs"
                  >
                    <span className="text-muted">{formatDateArabic(d.date)}</span>
                    <span className="font-semibold text-primary">{d.scoreOutOf10}/10</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {showReport && (
        <StudentReportDialog
          student={student}
          groupName={groupName}
          daily={daily}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ========================================================================
// نافذة "تقرير" — فترة مخصَّصة (تقدر تمتد لعدة شهور) مع تفصيل يومي كامل
// ========================================================================
function StudentReportDialog({ student, groupName, daily, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);

  const filtered = useMemo(
    () => daily.filter((d) => d.date >= fromDate && d.date <= toDate).sort((a, b) => a.date.localeCompare(b.date)),
    [daily, fromDate, toDate]
  );

  const periodAverage =
    filtered.length > 0
      ? Number((filtered.reduce((s, d) => s + d.scoreOutOf10, 0) / filtered.length).toFixed(2))
      : null;

  const periodLabel = `من ${formatDateArabic(fromDate)} إلى ${formatDateArabic(toDate)}`;

  const sendLink =
    student.parentPhone && periodAverage !== null
      ? buildCumulativeLink(student, groupName, periodLabel, periodAverage)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-bold text-primary">تقرير {student.name}</h3>
        <p className="mb-4 text-xs text-muted">اختر الفترة (تقدر تمتد لعدة شهور)</p>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">من</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-edge px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">إلى</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-edge px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-accent-soft px-4 py-3">
          <span className="text-sm font-medium text-accent-hover">التقييم التراكمي خلال الفترة</span>
          <span className="text-lg font-bold text-accent-hover">
            {periodAverage === null ? "—" : `${periodAverage}/10`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-edge">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-faint">لا توجد حصص مسجَّلة في هذه الفترة.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-alt text-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-right font-medium">الحضور</th>
                  <th className="px-3 py-2 text-right font-medium">المادة</th>
                  <th className="px-3 py-2 text-right font-medium">التقييم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <tr key={d.date}>
                    <td className="px-3 py-2 text-primary">{formatDateArabic(d.date)}</td>
                    <td className="px-3 py-2 text-muted">{ATTENDANCE_LABEL_AR[d.attendance] || "—"}</td>
                    <td className="px-3 py-2 text-muted">{d.subject || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-primary">{d.scoreOutOf10}/10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          {sendLink && (
            <a
              href={sendLink}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <WhatsAppIcon />
              إرسال هذا التقرير لولي الأمر
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-edge px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-alt"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

const ATTENDANCE_LABEL_AR = { Present: "حاضر", Absent: "غائب", Excused: "مستثنى" };

function ReportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ========================================================================
// بناء رسالة الواتساب للتقرير التراكمي — تقرأ القالب "الافتراضي" لفئة
// "تقرير تراكمي" وتستبدل متغيراته بالفترة والدرجة الفعليتين
// ========================================================================
function buildCumulativeLink(student, groupName, periodLabel, score) {
  const template = getDefaultTemplate("cumulative_report");
  if (!template) return null;

  const message = fillTemplate(template.body, {
    "[اسم_الطالب]": student.name,
    "[المجموعة]": groupName || "",
    "[الفترة]": periodLabel,
    "[التقييم_التراكمي]": `${score}`,
  });

  return buildWaLink(student.parentPhone, message);
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.3 11.85-11.84 0-3.16-1.24-6.13-3.38-8.44Z" />
    </svg>
  );
}

function ScoreBadge({ label, value }) {
  const color =
    value === null
      ? "bg-surface-alt text-faint"
      : value >= 8
      ? "bg-emerald-50 text-emerald-600"
      : value >= 5
      ? "bg-amber-50 text-amber-600"
      : "bg-rose-50 text-rose-600";

  return (
    <div className="text-center">
      <p className="mb-0.5 text-[10px] text-faint">{label}</p>
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${color}`}>
        {value === null ? "—" : `${value}/10`}
      </span>
    </div>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-faint transition-transform ${expanded ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
