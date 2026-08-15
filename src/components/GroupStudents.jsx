// src/components/GroupStudents.jsx
// عرض كل طلاب مجموعة معيّنة + تعديل بياناتهم (الاسم، الأرقام، نقلهم لمجموعة أخرى)
// يُفتح بالضغط على بطاقة المجموعة نفسها في شاشة Groups.jsx

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";

export default function GroupStudents({ group, onBack }) {
  const [editingStudent, setEditingStudent] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const students = useLiveQuery(
    () => db.students.where("groupId").equals(group.id).toArray(),
    [group.id],
    []
  );

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
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
          >
            <BackIcon /> رجوع لكل المجموعات
          </button>
          <h1 className="text-xl font-bold text-slate-900">طلاب "{group.groupName}"</h1>
          <p className="text-xs text-slate-500">{(students || []).length} طالب مسجَّل</p>
        </header>

        {students && students.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
            لا يوجد طلاب في هذه المجموعة بعد.
          </p>
        )}

        <div className="space-y-2">
          {(students || []).map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {s.name}
                  {!!s.isArchived && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      مؤرشف
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {s.parentPhone || "لا يوجد رقم ولي أمر"}
                </p>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => setEditingStudent(s)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  تعديل
                </button>
                <button
                  onClick={() => handleToggleArchive(s)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
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

  async function onSubmit(data) {
    await db.students.update(student.id, {
      name: data.name.trim(),
      phone: data.phone.trim(),
      parentPhone: data.parentPhone.trim(),
      groupId: Number(data.groupId),
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
        <h3 className="mb-4 text-base font-bold text-slate-900">تعديل بيانات الطالب</h3>

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
          <p className="mt-1 text-[11px] text-slate-400">
            تغيير المجموعة هنا ينقل الطالب فوراً — سجلاته القديمة (حضور/تقييم/مدفوعات) تبقى محفوظة كما هي.
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSubmitting ? "جارِ الحفظ..." : "حفظ التعديلات"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
        <h3 className="mb-2 text-lg font-bold text-slate-900">{title}</h3>
        <p className="mb-5 text-sm leading-relaxed text-slate-600">{message}</p>
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
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError) {
  return [
    "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition",
    "focus:ring-2 focus:ring-indigo-100",
    hasError ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-indigo-400",
  ].join(" ");
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
