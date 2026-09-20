// src/components/GroupStudents.jsx
// عرض كل طلاب مجموعة معيّنة + تعديل بياناتهم (الاسم، الأرقام، نقلهم لمجموعة أخرى)
// يُفتح بالضغط على بطاقة المجموعة نفسها في شاشة Groups.jsx

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import StudentCard from "./StudentCard";

export default function GroupStudents({ group, onBack, highlightStudentId }) {
  const [editingStudent, setEditingStudent] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [viewingCardOf, setViewingCardOf] = useState(null);

  const students = useLiveQuery(
    () => db.students.where("groupId").equals(group.id).toArray(),
    [group.id],
    []
  );

  useEffect(() => {
    if (!highlightStudentId || !students || students.length === 0) return;
    const el = document.getElementById(`student-${highlightStudentId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStudentId, students]);

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  async function handleToggleArchive(student) {
    await db.students.update(student.id, { isArchived: student.isArchived ? 0 : 1 });
  }

  async function handlePermanentDelete(student) {
    // حذف نهائي حقيقي (مختلف عن الأرشفة) — لازم نحذف كل سجلات الطالب المرتبطة
    // في الجداول الأخرى أيضاً، وإلا تبقى سجلات "يتيمة" تشير لطالب غير موجود
    await db.transaction("rw", db.students, db.attendance, db.tasks, db.payments, async () => {
      await db.students.delete(student.id);
      await db.attendance.where("studentId").equals(student.id).delete();
      await db.tasks.where("studentId").equals(student.id).delete();
      await db.payments.where("studentId").equals(student.id).delete();
    });
    setConfirmingDelete(null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
          >
            <BackIcon /> رجوع لكل المجموعات
          </button>
          <h1 className="text-xl font-bold text-stone-900">طلاب "{group.groupName}"</h1>
          <p className="text-xs text-stone-500">{(students || []).length} طالب مسجَّل</p>
        </header>

        {students && students.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            لا يوجد طلاب في هذه المجموعة بعد.
          </p>
        )}

        <div className="space-y-2">
          {(students || []).map((s) => (
            <div
              key={s.id}
              id={`student-${s.id}`}
              className={`flex flex-col gap-2.5 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                highlightStudentId === s.id
                  ? "border-amber-800 bg-amber-50"
                  : "border-stone-200 bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  {s.name}
                  {!!s.isArchived && (
                    <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                      مؤرشف
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-stone-500">
                  {s.parentPhone || "لا يوجد رقم ولي أمر"}
                </p>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => setViewingCardOf(s)}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  الكارنيه
                </button>
                <button
                  onClick={() => setEditingStudent(s)}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
                >
                  تعديل
                </button>
                <button
                  onClick={() => handleToggleArchive(s)}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
                >
                  {s.isArchived ? "إلغاء الأرشفة" : "أرشفة"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(s)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingStudent && (
        <EditStudentDialog
          student={editingStudent}
          groups={activeGroups || []}
          onClose={() => setEditingStudent(null)}
        />
      )}

      {viewingCardOf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto"
          onClick={() => setViewingCardOf(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <StudentCard student={viewingCardOf} groupName={group.groupName} />
            <button
              onClick={() => setViewingCardOf(null)}
              className="mt-3 w-full rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="حذف الطالب نهائياً؟"
          message={
            <>
              سيتم حذف <strong>{confirmingDelete.name}</strong> وكل سجلاته (الحضور، التقييم،
              المدفوعات) <strong>نهائياً</strong>، ولا يمكن التراجع عن هذا. لو غرضك فقط إخفاءه
              من القوائم النشطة مع الاحتفاظ بسجلاته، استخدم "أرشفة" بدلاً من ذلك.
            </>
          }
          confirmLabel="نعم، احذف نهائياً"
          onConfirm={() => handlePermanentDelete(confirmingDelete)}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}

// ========================================================================
// نافذة تعديل بيانات طالب
// ========================================================================
function EditStudentDialog({ student, groups, onClose }) {
  const [excludedMonths, setExcludedMonths] = useState(student.excludedMonths || []);
  const [monthToExclude, setMonthToExclude] = useState("");
  const [feeExemptMonths, setFeeExemptMonths] = useState(student.feeExemptMonths || []);
  const [monthToExempt, setMonthToExempt] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: student.name,
      phone: student.phone || "",
      parentPhone: student.parentPhone || "",
      groupId: student.groupId,
    },
  });

  function handleAddExcludedMonth() {
    if (!monthToExclude || excludedMonths.includes(monthToExclude)) return;
    setExcludedMonths([...excludedMonths, monthToExclude].sort());
    setMonthToExclude("");
  }

  function handleRemoveExcludedMonth(month) {
    setExcludedMonths(excludedMonths.filter((m) => m !== month));
  }

  function handleAddExemptMonth() {
    if (!monthToExempt || feeExemptMonths.includes(monthToExempt)) return;
    setFeeExemptMonths([...feeExemptMonths, monthToExempt].sort());
    setMonthToExempt("");
  }

  function handleRemoveExemptMonth(month) {
    setFeeExemptMonths(feeExemptMonths.filter((m) => m !== month));
  }

  async function onSubmit(data) {
    await db.students.update(student.id, {
      name: data.name.trim(),
      phone: data.phone.trim(),
      parentPhone: data.parentPhone.trim(),
      groupId: Number(data.groupId),
      excludedMonths,
      feeExemptMonths,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="mb-4 text-base font-bold text-stone-900">تعديل بيانات الطالب</h3>

        <Field label="اسم الطالب" error={errors.name?.message}>
          <input
            type="text"
            className={inputClass(errors.name)}
            {...register("name", { required: "اسم الطالب مطلوب", minLength: { value: 3, message: "الاسم قصير جداً" } })}
          />
        </Field>

        <div className="mt-3">
          <Field label="رقم هاتف الطالب (اختياري)" error={errors.phone?.message}>
            <input
              type="tel"
              dir="ltr"
              className={inputClass(errors.phone) + " text-left"}
              {...register("phone", { pattern: { value: /^[0-9+\s-]{7,15}$/, message: "رقم الهاتف غير صحيح" } })}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="رقم هاتف ولي الأمر" error={errors.parentPhone?.message}>
            <input
              type="tel"
              dir="ltr"
              className={inputClass(errors.parentPhone) + " text-left"}
              {...register("parentPhone", {
                required: "رقم ولي الأمر مطلوب",
                pattern: { value: /^[0-9+\s-]{7,15}$/, message: "رقم الهاتف غير صحيح" },
              })}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="المجموعة">
            <select className={inputClass(false)} {...register("groupId", { required: true })}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.groupName}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-1 text-[11px] text-stone-400">
            تغيير المجموعة هنا ينقل الطالب فوراً — سجلاته القديمة (حضور/تقييم/مدفوعات) تبقى محفوظة كما هي.
          </p>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-stone-900">
            استثناء أشهر من التقييم التراكمي
          </label>
          <p className="mb-2 text-[11px] text-stone-400">
            أي شهر تضيفه هنا لن يُحتسَب ضمن متوسط تقييم الطالب التراكمي في شاشة الإحصائيات
            (مفيد مثلاً لو انضم الطالب متأخراً أو غاب لظرف طارئ طول الشهر).
          </p>

          {excludedMonths.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {excludedMonths.map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1.5 rounded-full bg-rose-50 py-1 pl-1.5 pr-3 text-xs font-semibold text-rose-700"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => handleRemoveExcludedMonth(m)}
                    aria-label={`إلغاء استثناء ${m}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-rose-400 hover:bg-rose-100 hover:text-rose-700"
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="month"
              value={monthToExclude}
              onChange={(e) => setMonthToExclude(e.target.value)}
              className="flex-1 rounded-lg border border-stone-200 px-2.5 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={handleAddExcludedMonth}
              className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              استثناء
            </button>
          </div>
        </div>

        {/* قسم منفصل تماماً عن استثناء التقييم أعلاه — هذا يخص المالية فقط */}
        <div className="mt-4 border-t border-stone-100 pt-4">
          <label className="mb-1.5 block text-sm font-medium text-stone-900">
            إعفاء من مصروفات شهر
          </label>
          <p className="mb-2 text-[11px] text-stone-400">
            أي شهر تضيفه هنا، الطالب لن يُحسَب "متأخراً عن الدفع" فيه، ولن يدخل ضمن
            المبلغ المتوقَّع تحصيله في شاشة المالية — مفيد لو الطالب معفى استثنائياً
            أو انسحب مؤقتاً. لا علاقة له بالتقييم أو الحضور إطلاقاً.
          </p>

          {feeExemptMonths.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {feeExemptMonths.map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-1.5 pr-3 text-xs font-semibold text-emerald-700"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => handleRemoveExemptMonth(m)}
                    aria-label={`إلغاء إعفاء ${m}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700"
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="month"
              value={monthToExempt}
              onChange={(e) => setMonthToExempt(e.target.value)}
              className="flex-1 rounded-lg border border-stone-200 px-2.5 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={handleAddExemptMonth}
              className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              إعفاء
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {isSubmitting ? "جارِ الحفظ..." : "حفظ التعديلات"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}

// ========================================================================
// مكوّنات مساعدة
// ========================================================================
function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold text-stone-900">{title}</h3>
        <p className="mb-5 text-sm leading-relaxed text-stone-500">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {confirming ? "جارِ التنفيذ..." : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
          >
            تراجع
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-stone-900">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError) {
  return [
    "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition",
    "focus:ring-2 focus:ring-amber-100",
    hasError ? "border-rose-300 focus:border-rose-400" : "border-stone-200 focus:border-amber-800",
  ].join(" ");
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
