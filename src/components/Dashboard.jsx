// src/components/Dashboard.jsx
// لوحة التحكم الرئيسية - نظرة سريعة على يوم المدرس
// يعتمد على dexie-react-hooks (useLiveQuery) لتحديث الأرقام تلقائياً
// فور حدوث أي تغيير في قاعدة البيانات المحلية (بدون إعادة تحميل الصفحة)

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  todayStr,
  currentMonthStr,
  getExpectedStudentsToday,
  getPresentTodayCount,
  getLatePaymentStudents,
  getTotalIncome,
  exportAllData,
} from "../db/db";
import { getUpcomingSessions, formatSessionWhen, formatCountdown } from "../lib/schedule";

// عدد الأيام قبل تذكير المدرس بأخذ نسخة احتياطية
const BACKUP_REMINDER_DAYS = 7;
const LAST_BACKUP_KEY = "cms_last_backup_at";

export default function Dashboard({ onGoToArchive, onStartGroupSession }) {
  const today = todayStr();
  const month = currentMonthStr();
  const [exporting, setExporting] = useState(false);

  // نبضة كل دقيقة لإعادة حساب نصوص الوقت النسبي ("خلال 20 دقيقة" تتحول لـ"خلال 19 دقيقة"...)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const upcomingSessions = useLiveQuery(() => getUpcomingSessions(4), [], []);

  // ------------------------------------------------------------
  // استعلامات حيّة (Live Queries) - تتحدّث تلقائياً مع أي تغيير
  // ------------------------------------------------------------
  const expectedToday = useLiveQuery(() => getExpectedStudentsToday(), [], null);
  const presentToday = useLiveQuery(() => getPresentTodayCount(), [today], null);
  const lateStudents = useLiveQuery(() => getLatePaymentStudents(month), [month], null);
  const monthlyIncome = useLiveQuery(() => getTotalIncome(month), [month], null);

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  const isLoading =
    expectedToday === null ||
    presentToday === null ||
    lateStudents === null ||
    monthlyIncome === null;

  // ------------------------------------------------------------
  // تذكير النسخة الاحتياطية الأسبوعي
  // ------------------------------------------------------------
  const needsBackupReminder = useMemo(() => {
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
    if (!lastBackup) return true;
    const diffDays =
      (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= BACKUP_REMINDER_DAYS;
  }, []);

  // ------------------------------------------------------------
  // تصدير كل بيانات القاعدة إلى ملف JSON
  // (يستخدم exportAllData المشتركة من db.js — نفس الدالة التي تستخدمها شاشة
  // الإعدادات، لضمان تصدير كل الجداول دائماً بما فيها sessions، بدل الاعتماد
  // على نسخة محلية قد تُنسى تحديثها عند إضافة جدول جديد مستقبلاً)
  // ------------------------------------------------------------
  async function handleExportJSON() {
    setExporting(true);
    try {
      const payload = await exportAllData();

      downloadFile(
        `backup-${todayStr()}.json`,
        JSON.stringify(payload, null, 2),
        "application/json"
      );

      localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    } finally {
      setExporting(false);
    }
  }

  // ------------------------------------------------------------
  // تصدير جدول الطلاب إلى CSV (يمكن فتحه في Excel)
  // ------------------------------------------------------------
  async function handleExportCSV() {
    setExporting(true);
    try {
      const students = await db.students.toArray();
      const groups = await db.groups.toArray();
      const groupNameById = Object.fromEntries(groups.map((g) => [g.id, g.groupName]));

      const header = ["الاسم", "هاتف الطالب", "هاتف ولي الأمر", "المجموعة", "مؤرشف"];
      const rows = students.map((s) => [
        s.name,
        s.phone || "",
        s.parentPhone || "",
        groupNameById[s.groupId] || "",
        s.isArchived ? "نعم" : "لا",
      ]);

      const csv = [header, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n");

      // BOM لضمان ظهور الحروف العربية بشكل صحيح داخل Excel
      downloadFile(`students-${todayStr()}.csv`, "\uFEFF" + csv, "text/csv");
      localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    } finally {
      setExporting(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ------------------------------------------------------ */}
        {/* الرأس */}
        {/* ------------------------------------------------------ */}
        <header className="mb-6">
          <p className="text-sm font-medium text-amber-800">
            {new Date().toLocaleDateString("ar-EG", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-stone-900">
            لوحة التحكم
          </h1>
        </header>

        {/* ------------------------------------------------------ */}
        {/* الحصص القادمة — بناءً على مواعيد المجموعات الأسبوعية */}
        {/* ------------------------------------------------------ */}
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-stone-900">
            <CalendarIcon />
            الحصص القادمة
          </h2>

          {upcomingSessions && upcomingSessions.length === 0 && (
            <p className="text-sm text-stone-500">
              لا توجد مواعيد مُحدَّدة بعد. أضِف مواعيد مجموعاتك الأسبوعية من شاشة "إدارة المجموعات"
              ليظهر جدولك هنا تلقائياً.
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {(upcomingSessions || []).map((occ, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                <p className="text-sm font-semibold text-stone-900">{occ.groupName}</p>

                {occ.isActive ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      onClick={() => onStartGroupSession?.(occ.groupId)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      ابدأ الحصة
                    </button>
                    <span className="text-[11px] text-stone-400">{formatSessionWhen(occ.date)}</span>
                  </div>
                ) : (
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        i === 0 ? "bg-amber-50 text-amber-800" : "bg-stone-50 text-stone-500"
                      }`}
                    >
                      {formatCountdown(occ.date)}
                    </span>
                    <span className="text-[11px] text-stone-400">{formatSessionWhen(occ.date)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------------------------------------ */}
        {/* تنبيه النسخة الاحتياطية */}
        {/* ------------------------------------------------------ */}
        {needsBackupReminder && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertIcon />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  حان وقت النسخ الاحتياطي
                </p>
                <p className="text-sm text-amber-800">
                  لم تقم بتصدير نسخة من بياناتك منذ أكثر من {BACKUP_REMINDER_DAYS} أيام. احفظ نسخة الآن تجنباً لفقدان البيانات.
                </p>
              </div>
            </div>
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
            >
              {exporting ? "جارِ التصدير..." : "نسخ احتياطي الآن"}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* بطاقات الإحصائيات */}
        {/* ------------------------------------------------------ */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="الطلاب المتوقع حضورهم"
            value={isLoading ? "…" : expectedToday}
            icon={<UsersIcon />}
            accent="indigo"
          />
          <StatCard
            label="سُجّل حضورهم اليوم"
            value={isLoading ? "…" : presentToday}
            icon={<CheckIcon />}
            accent="emerald"
          />
          <StatCard
            label="متأخرون عن الدفع"
            value={isLoading ? "…" : lateStudents.length}
            icon={<CashAlertIcon />}
            accent="rose"
          />
          <StatCard
            label="دخل الشهر الحالي"
            value={isLoading ? "…" : `${monthlyIncome} ج.م`}
            icon={<CoinsIcon />}
            accent="amber"
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* -------------------------------------------------- */}
          {/* قائمة الطلاب المتأخرين عن الدفع */}
          {/* -------------------------------------------------- */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">
                متأخرون عن الدفع هذا الشهر
              </h2>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                {isLoading ? "…" : lateStudents.length} طالب
              </span>
            </div>

            {!isLoading && lateStudents.length === 0 && (
              <p className="py-8 text-center text-sm text-stone-500">
                لا يوجد طلاب متأخرون عن الدفع هذا الشهر 🎉
              </p>
            )}

            <ul className="divide-y divide-slate-100">
              {!isLoading &&
                lateStudents.slice(0, 6).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-900">{s.name}</p>
                      <p className="text-xs text-stone-500">{s.parentPhone || "لا يوجد رقم"}</p>
                    </div>
                    {s.parentPhone && (
                      <a
                        href={buildWhatsAppLink(s, month)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <WhatsAppIcon />
                        تذكير واتساب
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          </div>

          {/* -------------------------------------------------- */}
          {/* إجراءات سريعة */}
          {/* -------------------------------------------------- */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-bold text-stone-900">إجراءات سريعة</h2>
              <div className="grid grid-cols-3 gap-3">
                <QuickActionIcon
                  icon={<ExportJsonIcon />}
                  label="تصدير JSON"
                  onClick={handleExportJSON}
                  disabled={exporting}
                />
                <QuickActionIcon
                  icon={<ExportCsvIcon />}
                  label="تصدير CSV"
                  onClick={handleExportCSV}
                  disabled={exporting}
                />
                <QuickActionIcon icon={<ArchiveIcon />} label="أرشفة" onClick={onGoToArchive} />
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-bold text-stone-900">المجموعات النشطة</h2>
              {activeGroups.length === 0 ? (
                <p className="text-sm text-stone-500">لا توجد مجموعات مضافة بعد.</p>
              ) : (
                <ul className="space-y-2">
                  {activeGroups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-stone-900">{g.groupName}</span>
                      <span className="text-xs text-stone-500">{g.academicYear}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// مكونات فرعية صغيرة
// ====================================================================

function StatCard({ label, value, icon, accent }) {
  const accentMap = {
    indigo: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accentMap[accent]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
    </div>
  );
}

function QuickActionIcon({ icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 py-3 text-stone-700 transition hover:border-amber-800 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
        {icon}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function ExportJsonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function ExportCsvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="10" x2="9" y2="20" />
      <line x1="15" y1="10" x2="15" y2="20" />
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

// ====================================================================
// دوال مساعدة
// ====================================================================

/** يبني رابط واتساب جاهز يحتوي رسالة تذكير بالدفع لولي أمر الطالب */
function buildWhatsAppLink(student, month) {
  const phone = (student.parentPhone || "").replace(/\D/g, "");
  const message = `السلام عليكم، نود تذكيركم بأن مصاريف شهر ${month} الخاصة بالطالب/ة ${student.name} لم تُسدد بعد. برجاء التكرم بالسداد في أقرب وقت. شكراً لتعاونكم.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ====================================================================
// أيقونات بسيطة (SVG inline لتفادي أي اعتماديات خارجية)
// ====================================================================

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-amber-600">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CashAlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function CoinsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.3 11.85-11.84 0-3.16-1.24-6.13-3.38-8.44Z" />
    </svg>
  );
}
