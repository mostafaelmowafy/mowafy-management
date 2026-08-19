// src/components/AddStudent.jsx
// شاشة إضافة طالب جديد + توليد كارنيه QR فوري بعد الحفظ
// يعتمد على: react-hook-form لإدارة النموذج، qrcode.react لتوليد الكود،
// و Dexie لحفظ البيانات محلياً (qrCode يُولَّد تلقائياً داخل db.js عبر hook).

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import StudentCard from "./StudentCard";

export default function AddStudent({ onDone }) {
  const [savedStudent, setSavedStudent] = useState(null); // null = وضع النموذج، غير null = وضع الكارنيه

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: "",
      phone: "",
      parentPhone: "",
      groupId: "",
    },
  });

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  async function onSubmit(data) {
    const newId = await db.students.add({
      name: data.name.trim(),
      phone: data.phone.trim(),
      parentPhone: data.parentPhone.trim(),
      groupId: Number(data.groupId),
    });

    const created = await db.students.get(newId);
    setSavedStudent(created);
  }

  function handleAddAnother() {
    reset();
    setSavedStudent(null);
  }

  // ------------------------------------------------------------
  // وضع عرض الكارنيه بعد الحفظ
  // ------------------------------------------------------------
  if (savedStudent) {
    return (
      <StudentCardView
        student={savedStudent}
        groups={activeGroups}
        onAddAnother={handleAddAnother}
        onDone={onDone}
      />
    );
  }

  // ------------------------------------------------------------
  // وضع النموذج
  // ------------------------------------------------------------
  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-bold text-stone-900">إضافة طالب جديد</h1>
        <p className="mb-6 text-sm text-stone-500">
          سيتم توليد كود QR فريد للطالب تلقائياً فور الحفظ.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6"
        >
          {/* اسم الطالب */}
          <Field label="اسم الطالب" error={errors.name?.message}>
            <input
              type="text"
              placeholder="مثال: أحمد محمد علي"
              className={inputClass(errors.name)}
              {...register("name", {
                required: "اسم الطالب مطلوب",
                minLength: { value: 3, message: "الاسم قصير جداً" },
              })}
            />
          </Field>

          {/* رقم هاتف الطالب */}
          <Field label="رقم هاتف الطالب (اختياري)" error={errors.phone?.message}>
            <input
              type="tel"
              placeholder="01xxxxxxxxx"
              dir="ltr"
              className={inputClass(errors.phone) + " text-left"}
              {...register("phone", {
                pattern: {
                  value: /^[0-9+\s-]{7,15}$/,
                  message: "رقم الهاتف غير صحيح",
                },
              })}
            />
          </Field>

          {/* رقم هاتف ولي الأمر */}
          <Field label="رقم هاتف ولي الأمر" error={errors.parentPhone?.message}>
            <input
              type="tel"
              placeholder="01xxxxxxxxx"
              dir="ltr"
              className={inputClass(errors.parentPhone) + " text-left"}
              {...register("parentPhone", {
                required: "رقم ولي الأمر مطلوب (يُستخدم لاحقاً في إرسال رسائل واتساب)",
                pattern: {
                  value: /^[0-9+\s-]{7,15}$/,
                  message: "رقم الهاتف غير صحيح",
                },
              })}
            />
          </Field>

          {/* اختيار المجموعة */}
          <Field label="المجموعة" error={errors.groupId?.message}>
            <select
              className={inputClass(errors.groupId)}
              defaultValue=""
              {...register("groupId", { required: "يجب اختيار مجموعة" })}
            >
              <option value="" disabled>
                اختر مجموعة...
              </option>
              {(activeGroups || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.groupName} — {g.academicYear}
                </option>
              ))}
            </select>
            {activeGroups && activeGroups.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                لا توجد مجموعات بعد. أضف مجموعة أولاً من شاشة إدارة المجموعات.
              </p>
            )}
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-amber-800 px-5 py-3 text-base font-semibold text-white shadow-sm shadow-amber-200 transition hover:bg-amber-900 active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting ? "جارِ الحفظ..." : "حفظ وتوليد الكارنيه"}
            </button>
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-medium text-stone-500 hover:bg-stone-50"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================================================================
// عرض الكارنيه + أزرار الطباعة والحفظ كصورة
// ======================================================================
function StudentCardView({ student, groups, onAddAnother, onDone }) {
  const groupName =
    (groups || []).find((g) => g.id === student.groupId)?.groupName || "—";

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          تم حفظ بيانات الطالب بنجاح ✅
        </div>

        <StudentCard student={student} groupName={groupName} />

        {/* أزرار إضافية خاصة بمسار "إضافة طالب" (تختفي عند الطباعة لأنها خارج printable-card) */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onAddAnother}
            className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
          >
            إضافة طالب آخر
          </button>
          {onDone && (
            <button
              onClick={onDone}
              className="flex-1 rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-900"
            >
              العودة للوحة التحكم
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ======================================================================
// مكوّنات وأدوات مساعدة صغيرة
// ======================================================================

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
    hasError
      ? "border-rose-300 focus:border-rose-400"
      : "border-stone-200 focus:border-amber-800",
  ].join(" ");
}
