// src/components/Finance.jsx
// شاشة المالية — تقرير تحصيل شامل لكل المجموعات في شهر معيّن:
// المُحصَّل فعلياً، المتوقَّع تحصيله (بناءً على الرسم الشهري لكل مجموعة إن وُجد)،
// والمتبقي، بالإضافة لإجمالي عام يجمع كل المجاميع معاً.

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, currentMonthStr } from "../db/db";

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

function monthLabel(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  return `${ARABIC_MONTHS[month - 1]} ${year}`;
}

export default function Finance({ onDone }) {
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(currentMonthStr());

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  const activeStudents = useLiveQuery(
    () => db.students.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  const monthPayments = useLiveQuery(
    () => db.payments.where("month").equals(month).toArray(),
    [month],
    []
  );

  // تجميع الطلاب والمدفوعات حسب المجموعة، وحساب كل الأرقام لكل مجموعة دفعة واحدة
  const groupReports = useMemo(() => {
    const studentsByGroup = new Map();
    (activeStudents || []).forEach((s) => {
      if (!studentsByGroup.has(s.groupId)) studentsByGroup.set(s.groupId, []);
      studentsByGroup.get(s.groupId).push(s);
    });

    const paymentsByStudent = new Map();
    (monthPayments || []).forEach((p) => {
      paymentsByStudent.set(p.studentId, (paymentsByStudent.get(p.studentId) || 0) + Number(p.amount || 0));
    });

    return (activeGroups || []).map((group) => {
      const students = studentsByGroup.get(group.id) || [];
      const exemptStudents = students.filter((s) => (s.feeExemptMonths || []).includes(month));
      const payableStudents = students.filter((s) => !(s.feeExemptMonths || []).includes(month));

      const paidStudents = students.filter((s) => paymentsByStudent.has(s.id));
      const collected = paidStudents.reduce((sum, s) => sum + paymentsByStudent.get(s.id), 0);
      const hasFee = !!group.monthlyFee;
      // "المتوقَّع" محسوب من الطلاب غير المُعفَين فقط لهذا الشهر — إعفاء طالب لا
      // يُفترض أن يُحمَّل على المتوقَّع تحصيله أصلاً
      const expected = hasFee ? group.monthlyFee * payableStudents.length : null;
      const remaining = expected !== null ? Math.max(expected - collected, 0) : null;

      return {
        group,
        totalStudents: payableStudents.length,
        exemptCount: exemptStudents.length,
        paidCount: paidStudents.filter((s) => !exemptStudents.includes(s)).length,
        collected,
        expected,
        remaining,
        hasFee,
      };
    });
  }, [activeGroups, activeStudents, monthPayments, month]);

  const grandTotals = useMemo(() => {
    const collected = groupReports.reduce((sum, r) => sum + r.collected, 0);
    const groupsWithFee = groupReports.filter((r) => r.hasFee);
    const expected = groupsWithFee.reduce((sum, r) => sum + (r.expected || 0), 0);
    const remaining = groupsWithFee.reduce((sum, r) => sum + (r.remaining || 0), 0);
    const someGroupsMissingFee = groupReports.some((r) => !r.hasFee && r.totalStudents > 0);
    return { collected, expected, remaining, someGroupsMissingFee, hasAnyFee: groupsWithFee.length > 0 };
  }, [groupReports]);

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-900">المالية</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              العودة
            </button>
          )}
        </header>

        {/* اختيار الشهر */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5">
          <label className="mb-1.5 block text-sm font-medium text-stone-900">الشهر</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100 sm:max-w-xs"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* الإجمالي العام */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-stone-500">إجمالي المُحصَّل — {monthLabel(month)}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{grandTotals.collected} ج.م</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-stone-500">إجمالي المتوقَّع</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              {grandTotals.hasAnyFee ? `${grandTotals.expected} ج.م` : "—"}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border border-stone-200 bg-white p-4 sm:col-span-1">
            <p className="text-xs text-stone-500">إجمالي المتبقي</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">
              {grandTotals.hasAnyFee ? `${grandTotals.remaining} ج.م` : "—"}
            </p>
          </div>
        </div>

        {grandTotals.someGroupsMissingFee && (
          <p className="mb-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            بعض المجموعات ليس لها "رسم شهري" محدَّد، فلم تُحتسَب ضمن "المتوقَّع" و"المتبقي" أعلاه —
            حدِّده من زر "تعديل المواعيد والرسوم" في شاشة إدارة المجموعات لحساب أدق.
          </p>
        )}

        {/* تقرير كل مجموعة */}
        {groupReports.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            لا توجد مجموعات نشطة بعد.
          </p>
        )}

        <div className="space-y-3">
          {groupReports.map((r) => (
            <div key={r.group.id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-semibold text-stone-900">{r.group.groupName}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {r.exemptCount > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {r.exemptCount} معفى
                    </span>
                  )}
                  <span className="rounded-full bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-500">
                    {r.paidCount} / {r.totalStudents} دفعوا
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[11px] text-stone-500">المُحصَّل</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-600">{r.collected} ج.م</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">المتوقَّع</p>
                  <p className="mt-0.5 text-sm font-bold text-stone-900">
                    {r.hasFee ? `${r.expected} ج.م` : "غير محدَّد"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">المتبقي</p>
                  <p className="mt-0.5 text-sm font-bold text-rose-600">
                    {r.hasFee ? `${r.remaining} ج.م` : "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
