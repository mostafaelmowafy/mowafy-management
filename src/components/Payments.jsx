// src/components/Payments.jsx
// شاشة المدفوعات الشهرية لكل مجموعة
// تعتمد على الفهرس المركب [studentId+month] الموجود أصلاً في جدول payments (db.js)

import React, { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, currentMonthStr } from "../db/db";
import { getDefaultTemplate, fillTemplate, buildWhatsAppLink as buildWaLink } from "../lib/whatsappTemplates";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** يبني قائمة أشهر بصيغة YYYY-MM حول الشهر الحالي (6 أشهر قبل و6 بعد) */
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

function formatDateArabic(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${ARABIC_MONTHS[month - 1]} ${year}`;
}

// ========================================================================
export default function Payments({ onDone }) {
  const monthOptions = useMemo(buildMonthOptions, []);

  const [groupId, setGroupId] = useState("");
  const [month, setMonth] = useState(currentMonthStr());

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

  // كل مدفوعات هذا الشهر (لكل الطلاب)، نُفلترها محلياً حسب طلاب هذه المجموعة
  const monthPayments = useLiveQuery(
    () => db.payments.where("month").equals(month).toArray(),
    [month],
    []
  );

  const paymentMap = useMemo(() => {
    const map = new Map();
    (monthPayments || []).forEach((p) => map.set(p.studentId, p));
    return map;
  }, [monthPayments]);

  const studentsWithStatus = useMemo(() => {
    return (students || []).map((s) => ({
      student: s,
      payment: paymentMap.get(s.id) || null,
      isExempt: (s.feeExemptMonths || []).includes(month),
    }));
  }, [students, paymentMap, month]);

  const selectedGroup = (activeGroups || []).find((g) => g.id === numericGroupId);

  // الإحصائيات (كم دفع/إجمالي) تُحتسَب من الطلاب غير المُعفَين فقط — المُعفى لا
  // يُعتبر "لم يدفع بعد"، فمن غير المنطقي إدراجه ضمن العدد المستهدَف للتحصيل
  const payableStudents = studentsWithStatus.filter((row) => !row.isExempt);
  const paidCount = payableStudents.filter((row) => row.payment).length;
  const totalStudents = payableStudents.length;
  const totalCollected = studentsWithStatus.reduce(
    (sum, row) => sum + (row.payment ? Number(row.payment.amount || 0) : 0),
    0
  );

  async function handlePay(studentId, amount) {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;

    await db.payments.add({
      studentId,
      amount: numericAmount,
      month,
      paymentDate: new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        {/* الرأس */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-900">المدفوعات الشهرية</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              العودة
            </button>
          )}
        </header>

        {/* الفلاتر */}
        <div className="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-900">المجموعة</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
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
            <label className="mb-1.5 block text-sm font-medium text-stone-900">الشهر</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* بطاقة الإجماليات */}
        {numericGroupId && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">إجمالي المُحصَّل — {monthLabel(month)}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{totalCollected} ج.م</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">عدد الدافعين</p>
              <p className="mt-1 text-2xl font-bold text-stone-900">
                {paidCount}
                <span className="text-base font-normal text-stone-400"> / {totalStudents}</span>
              </p>
            </div>
          </div>
        )}

        {/* حالات فارغة */}
        {!numericGroupId && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            اختر مجموعة لعرض حالة المدفوعات.
          </p>
        )}

        {numericGroupId && studentsWithStatus.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            لا يوجد طلاب نشطون في هذه المجموعة.
          </p>
        )}

        {/* قائمة الطلاب */}
        {numericGroupId && studentsWithStatus.length > 0 && (
          <div className="space-y-3">
            {studentsWithStatus.map(({ student, payment, isExempt }) => (
              <PaymentRow
                key={student.id}
                student={student}
                group={selectedGroup}
                payment={payment}
                isExempt={isExempt}
                month={month}
                onPay={(amount) => handlePay(student.id, amount)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// صف طالب واحد
// ========================================================================
function PaymentRow({ student, group, payment, isExempt, month, onPay }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const whatsappHref = student.parentPhone && !isExempt
    ? buildWhatsAppLink(student, group, month, payment)
    : null;

  async function handlePayClick() {
    if (!amount) return;
    setSaving(true);
    try {
      await onPay(amount);
      setAmount("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-stone-900">{student.name}</p>
        <p className="text-xs text-stone-500">{student.parentPhone || "لا يوجد رقم ولي أمر"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {isExempt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-600">
            <ExemptIcon />
            معفى هذا الشهر
          </span>
        ) : payment ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <CheckIcon />
              تم الدفع — {payment.amount} ج.م
            </span>
            <span className="text-xs text-stone-400">{formatDateArabic(payment.paymentDate)}</span>
          </>
        ) : (
          <>
            <input
              type="number"
              min="1"
              placeholder="المبلغ"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-lg border border-stone-200 px-2.5 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
            />
            <button
              onClick={handlePayClick}
              disabled={!amount || saving}
              className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
            >
              {saving ? "جارِ الحفظ..." : "تسديد"}
            </button>
          </>
        )}

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
              payment
                ? "bg-stone-50 text-stone-500 hover:bg-stone-50"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <WhatsAppIcon />
            {payment ? "إرسال إيصال" : "تذكير بالدفع"}
          </a>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// رسالة الواتساب الديناميكية: تذكير (لم يدفع) أو إيصال (دفع)
// تقرأ القالب "الافتراضي" للفئة المناسبة من الإعدادات وتستبدل متغيراته
// ========================================================================
function buildWhatsAppLink(student, group, month, payment) {
  const category = payment ? "payment_confirmation" : "payment_reminder";
  const template = getDefaultTemplate(category);
  if (!template) return null; // لا يوجد أي قالب في هذه الفئة (حالة نادرة)

  const message = fillTemplate(template.body, {
    "[اسم_الطالب]": student.name,
    "[المجموعة]": group?.groupName || "",
    "[المادة]": "",
    "[اسم_الشهر]": monthLabel(month),
    "[المبلغ]": payment ? String(payment.amount) : "",
    // متغيرات غير متعلقة بالمدفوعات — تُترك فارغة إن استخدمها المدرس هنا بالخطأ
    "[حالة_الحضور]": "",
    "[نجوم_الواجب]": "",
    "[نجوم_التفاعل]": "",
    "[درجة_الامتحان]": "",
    "[الدرجة_النهائية_للامتحان]": "",
    "[التقييم_العام]": "",
  });

  return buildWaLink(student.parentPhone, message);
}

function ExemptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
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
