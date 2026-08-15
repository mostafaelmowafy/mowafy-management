// src/components/AddStudent.jsx
// شاشة إضافة طالب جديد + توليد كارنيه QR فوري بعد الحفظ
// يعتمد على: react-hook-form لإدارة النموذج، qrcode.react لتوليد الكود،
// و Dexie لحفظ البيانات محلياً (qrCode يُولَّد تلقائياً داخل db.js عبر hook).

import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { QRCodeCanvas } from "qrcode.react";
import { db } from "../db/db";

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
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">إضافة طالب جديد</h1>
        <p className="mb-6 text-sm text-slate-500">
          سيتم توليد كود QR فريد للطالب تلقائياً فور الحفظ.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6"
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
              className="flex-1 rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting ? "جارِ الحفظ..." : "حفظ وتوليد الكارنيه"}
            </button>
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
  const canvasRef = useRef(null);
  const groupName =
    (groups || []).find((g) => g.id === student.groupId)?.groupName || "—";

  function handleSaveAsImage() {
    const sourceCanvas = canvasRef.current?.querySelector("canvas");
    if (!sourceCanvas) return;

    // نرسم الكارنيه كاملاً (اسم + مجموعة + QR) على canvas مؤقت لتصديره كصورة واحدة
    const width = 420;
    const height = 560;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext("2d");

    // خلفية
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // شريط علوي
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(0, 0, width, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Tahoma, Arial";
    ctx.textAlign = "center";
    ctx.fillText("كارنيه الطالب", width / 2, 44);

    // كود QR
    const qrSize = 240;
    ctx.drawImage(sourceCanvas, (width - qrSize) / 2, 100, qrSize, qrSize);

    // اسم الطالب والمجموعة
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px Tahoma, Arial";
    ctx.fillText(student.name, width / 2, 380);

    ctx.fillStyle = "#475569";
    ctx.font = "16px Tahoma, Arial";
    ctx.fillText(groupName, width / 2, 410);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px Tahoma, Arial";
    ctx.fillText(student.qrCode, width / 2, 440);

    const link = document.createElement("a");
    link.download = `card-${student.name}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* أنماط خاصة بالطباعة: تُظهر الكارنيه فقط وتُخفي كل شيء آخر */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-card, #printable-card * { visibility: visible; }
          #printable-card {
            position: fixed;
            top: 0; left: 0; right: 0;
            margin: 40px auto;
          }
        }
      `}</style>

      <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          تم حفظ بيانات الطالب بنجاح ✅
        </div>

        {/* الكارنيه */}
        <div
          id="printable-card"
          className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="bg-indigo-600 py-3 text-center text-sm font-bold text-white">
            كارنيه الطالب
          </div>
          <div ref={canvasRef} className="flex justify-center bg-white py-6">
            <QRCodeCanvas value={student.qrCode} size={200} level="M" includeMargin />
          </div>
          <div className="border-t border-slate-100 px-4 pb-5 pt-3 text-center">
            <p className="text-lg font-bold text-slate-900">{student.name}</p>
            <p className="text-sm text-slate-500">{groupName}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{student.qrCode}</p>
          </div>
        </div>

        {/* أزرار الإجراءات (تختفي عند الطباعة تلقائياً لأنها خارج printable-card) */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={handlePrint}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            طباعة الكارنيه
          </button>
          <button
            onClick={handleSaveAsImage}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            حفظ كصورة
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onAddAnother}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            إضافة طالب آخر
          </button>
          {onDone && (
            <button
              onClick={onDone}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
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
    hasError
      ? "border-rose-300 focus:border-rose-400"
      : "border-slate-200 focus:border-indigo-400",
  ].join(" ");
}
