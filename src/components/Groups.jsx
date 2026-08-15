// src/components/Groups.jsx
// شاشة إدارة المجموعات — مركز التحكم الأساسي
// أول ما تفتح الشاشة تشوف المجموعات النشطة مباشرة. "إضافة مجموعة جديدة" بقى زر
// يفتح فورم في نافذة منبثقة (بدل ما يكون ظاهر وثابت فوق طول الوقت).

import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { DAY_NAMES_AR } from "../lib/schedule";
import GroupStudents from "./GroupStudents";

export default function Groups({ onDone }) {
  const [activeTab, setActiveTab] = useState("active"); // active | archived
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState(null); // مجموعة قيد التعديل الكامل
  const [groupToArchive, setGroupToArchive] = useState(null); // مجموعة قيد تأكيد الأرشفة
  const [groupToDelete, setGroupToDelete] = useState(null); // مجموعة قيد تأكيد الحذف النهائي
  const [viewingStudentsOf, setViewingStudentsOf] = useState(null); // مجموعة نعرض طلابها حالياً

  // ------------------------------------------------------------
  // استعلامات حيّة
  // ------------------------------------------------------------
  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  const archivedGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(1).toArray(),
    [],
    []
  );

  // عدد الطلاب النشطين لكل مجموعة — استعلام واحد ثم تجميع محلياً (أسرع من استعلام لكل بطاقة)
  const activeStudents = useLiveQuery(
    () => db.students.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  const studentCountByGroup = useMemo(() => {
    const map = new Map();
    (activeStudents || []).forEach((s) => {
      map.set(s.groupId, (map.get(s.groupId) || 0) + 1);
    });
    return map;
  }, [activeStudents]);

  // ------------------------------------------------------------
  // الأرشفة مع تأثير Cascade على الطلاب
  // ------------------------------------------------------------
  async function confirmArchive() {
    if (!groupToArchive) return;
    const groupId = groupToArchive.id;
    await db.transaction("rw", db.groups, db.students, async () => {
      await db.groups.update(groupId, { isArchived: 1 });
      await db.students.where("groupId").equals(groupId).modify({ isArchived: 1 });
    });
    setGroupToArchive(null);
  }

  // ------------------------------------------------------------
  // الحذف النهائي — يحذف المجموعة وكل طلابها وسجلاتهم المرتبطة بالكامل
  // ------------------------------------------------------------
  async function confirmDelete() {
    if (!groupToDelete) return;
    const groupId = groupToDelete.id;
    const studentIds = (await db.students.where("groupId").equals(groupId).toArray()).map((s) => s.id);

    await db.transaction(
      "rw",
      db.groups,
      db.students,
      db.attendance,
      db.tasks,
      db.payments,
      db.sessions,
      async () => {
        await db.groups.delete(groupId);
        await db.sessions.where("groupId").equals(groupId).delete();
        for (const studentId of studentIds) {
          await db.students.delete(studentId);
          await db.attendance.where("studentId").equals(studentId).delete();
          await db.tasks.where("studentId").equals(studentId).delete();
          await db.payments.where("studentId").equals(studentId).delete();
        }
      }
    );
    setGroupToDelete(null);
  }

  // الضغط على بطاقة مجموعة يفتح شاشة "طلاب هذه المجموعة" بدل شاشة إدارة المجموعات
  // (بعد كل الـ Hooks أعلاه، حتى لا يختلف عدد/ترتيب استدعاءات الـ Hooks بين الرندرات)
  if (viewingStudentsOf) {
    return <GroupStudents group={viewingStudentsOf} onBack={() => setViewingStudentsOf(null)} />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* الرأس */}
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">إدارة المجموعات</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              العودة
            </button>
          )}
        </header>

        {/* زر إضافة مجموعة جديدة */}
        <button
          onClick={() => setShowAddDialog(true)}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 active:scale-[0.98] sm:w-auto"
        >
          <PlusIcon />
          إضافة مجموعة جديدة
        </button>

        {/* التبويبات */}
        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <TabButton active={activeTab === "active"} onClick={() => setActiveTab("active")}>
            المجموعات النشطة
            <CountBadge count={(activeGroups || []).length} />
          </TabButton>
          <TabButton active={activeTab === "archived"} onClick={() => setActiveTab("archived")}>
            عرض السجل التاريخي
            <CountBadge count={(archivedGroups || []).length} muted />
          </TabButton>
        </div>

        {/* قائمة المجموعات النشطة */}
        {activeTab === "active" && (
          <>
            {activeGroups && activeGroups.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
                لا توجد مجموعات نشطة بعد. اضغط "إضافة مجموعة جديدة" أعلاه للبدء.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(activeGroups || []).map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  studentCount={studentCountByGroup.get(group.id) || 0}
                  onArchive={() => setGroupToArchive(group)}
                  onDelete={() => setGroupToDelete(group)}
                  onEdit={() => setGroupToEdit(group)}
                  onViewStudents={() => setViewingStudentsOf(group)}
                />
              ))}
            </div>
          </>
        )}

        {/* قائمة المجموعات المؤرشفة (قراءة فقط) */}
        {activeTab === "archived" && (
          <>
            {archivedGroups && archivedGroups.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
                لا توجد مجموعات مؤرشفة حتى الآن.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(archivedGroups || []).map((group) => (
                <ArchivedGroupCard key={group.id} group={group} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* نافذة إضافة مجموعة جديدة */}
      {showAddDialog && <AddGroupDialog onClose={() => setShowAddDialog(false)} />}

      {/* نافذة تعديل بيانات مجموعة (الاسم/السنة/الرسم/المواعيد) */}
      {groupToEdit && <EditGroupDialog group={groupToEdit} onClose={() => setGroupToEdit(null)} />}

      {/* نافذة تأكيد الأرشفة */}
      {groupToArchive && (
        <ConfirmDialog
          title="أرشفة المجموعة؟"
          message={
            <>
              سيتم أرشفة مجموعة <strong>"{groupToArchive.groupName}"</strong> وجميع طلابها المرتبطين بها.
              ستختفي المجموعة وطلابها من قوائم الحضور والتقييم والمدفوعات النشطة، مع الاحتفاظ
              بكل سجلاتهم التاريخية للرجوع إليها لاحقاً من السجل التاريخي.
            </>
          }
          confirmLabel="نعم، أرشفة المجموعة"
          confirmColor="rose"
          onConfirm={confirmArchive}
          onCancel={() => setGroupToArchive(null)}
        />
      )}

      {/* نافذة تأكيد الحذف النهائي */}
      {groupToDelete && (
        <ConfirmDialog
          title="حذف المجموعة نهائياً؟"
          message={
            <>
              سيتم حذف مجموعة <strong>"{groupToDelete.groupName}"</strong> نهائياً، بالإضافة لكل
              طلابها وكل سجلاتهم (الحضور، التقييم، المدفوعات) <strong>بشكل كامل ولا يمكن التراجع
              عنه إطلاقاً</strong>. لو غرضك فقط إخفاء المجموعة مع الاحتفاظ بسجلاتها، استخدم
              "أرشفة" بدلاً من ذلك.
            </>
          }
          confirmLabel="نعم، احذف نهائياً"
          confirmColor="rose"
          onConfirm={confirmDelete}
          onCancel={() => setGroupToDelete(null)}
        />
      )}
    </div>
  );
}

// ======================================================================
// نافذة إضافة مجموعة جديدة
// ======================================================================
function AddGroupDialog({ onClose }) {
  const [schedule, setSchedule] = useState([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { groupName: "", academicYear: "", monthlyFee: "" } });

  async function onSubmit(data) {
    await db.groups.add({
      groupName: data.groupName.trim(),
      academicYear: data.academicYear.trim(),
      isArchived: 0,
      schedule,
      monthlyFee: data.monthlyFee ? Number(data.monthlyFee) : 0,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="mb-4 text-base font-bold text-slate-900">إضافة مجموعة جديدة</h3>

        <div className="space-y-4">
          <Field label="اسم المجموعة" error={errors.groupName?.message}>
            <input
              type="text"
              placeholder="مثال: الصف الأول الثانوي - السبت والثلاثاء"
              className={inputClass(errors.groupName)}
              {...register("groupName", {
                required: "اسم المجموعة مطلوب",
                minLength: { value: 3, message: "الاسم قصير جداً" },
              })}
            />
          </Field>

          <Field label="السنة الدراسية" error={errors.academicYear?.message}>
            <input
              type="text"
              placeholder="مثال: 2025 - 2026"
              className={inputClass(errors.academicYear)}
              {...register("academicYear", { required: "السنة الدراسية مطلوبة" })}
            />
          </Field>

          <Field label="الرسم الشهري لكل طالب (اختياري)" error={errors.monthlyFee?.message}>
            <input
              type="number"
              min="0"
              placeholder="مثال: 150"
              className={inputClass(errors.monthlyFee)}
              {...register("monthlyFee")}
            />
          </Field>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              مواعيد الحصص الأسبوعية (اختياري)
            </label>
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSubmitting ? "جارِ الحفظ..." : "إضافة المجموعة"}
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

// ======================================================================
// نافذة تعديل بيانات مجموعة موجودة — كل شيء: الاسم، السنة، الرسم، المواعيد
// ======================================================================
function EditGroupDialog({ group, onClose }) {
  const [schedule, setSchedule] = useState(group.schedule || []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      groupName: group.groupName,
      academicYear: group.academicYear,
      monthlyFee: group.monthlyFee || "",
    },
  });

  async function onSubmit(data) {
    await db.groups.update(group.id, {
      groupName: data.groupName.trim(),
      academicYear: data.academicYear.trim(),
      monthlyFee: data.monthlyFee ? Number(data.monthlyFee) : 0,
      schedule,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="mb-4 text-base font-bold text-slate-900">تعديل بيانات المجموعة</h3>

        <div className="space-y-4">
          <Field label="اسم المجموعة" error={errors.groupName?.message}>
            <input
              type="text"
              className={inputClass(errors.groupName)}
              {...register("groupName", {
                required: "اسم المجموعة مطلوب",
                minLength: { value: 3, message: "الاسم قصير جداً" },
              })}
            />
          </Field>

          <Field label="السنة الدراسية" error={errors.academicYear?.message}>
            <input
              type="text"
              className={inputClass(errors.academicYear)}
              {...register("academicYear", { required: "السنة الدراسية مطلوبة" })}
            />
          </Field>

          <Field label="الرسم الشهري لكل طالب (اختياري)" error={errors.monthlyFee?.message}>
            <input type="number" min="0" className={inputClass(errors.monthlyFee)} {...register("monthlyFee")} />
          </Field>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              مواعيد الحصص الأسبوعية
            </label>
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </div>
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

// ======================================================================
// بطاقة مجموعة نشطة
// ======================================================================
function GroupCard({ group, studentCount, onArchive, onDelete, onEdit, onViewStudents }) {
  const schedule = group.schedule || [];
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
      <button
        type="button"
        onClick={onViewStudents}
        className="-m-1 rounded-xl p-1 text-right transition hover:bg-slate-50"
        aria-label={`عرض طلاب ${group.groupName}`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">{group.groupName}</h3>
          <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">
            {group.academicYear}
          </span>
        </div>
        <p className="mb-2 flex items-center gap-1.5 text-sm text-slate-500">
          <UsersIcon />
          {studentCount} طالب نشط — اضغط لعرض القائمة
        </p>

        {schedule.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <ClockIcon />
            {schedule
              .slice()
              .sort((a, b) => a.day - b.day)
              .map((s) => `${DAY_NAMES_AR[s.day]} ${formatTime12h(s.time)}`)
              .join(" · ")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <ClockIcon />
            لم تُحدَّد مواعيد بعد
          </p>
        )}
      </button>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={onEdit}
          className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          تعديل
        </button>
        <button
          onClick={onArchive}
          className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
        >
          أرشفة
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
        >
          حذف نهائي
        </button>
      </div>
    </div>
  );
}

function formatTime12h(timeStr) {
  const [h, m] = (timeStr || "0:0").split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ======================================================================
// بطاقة مجموعة مؤرشفة (قراءة فقط)
// ======================================================================
function ArchivedGroupCard({ group }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 opacity-80">
      <div>
        <h3 className="text-base font-bold text-slate-700">{group.groupName}</h3>
        <p className="text-sm text-slate-500">{group.academicYear}</p>
      </div>
      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
        مؤرشفة
      </span>
    </div>
  );
}

// ======================================================================
// نافذة تأكيد عامة
// ======================================================================
function ConfirmDialog({ title, message, confirmLabel, confirmColor = "rose", onConfirm, onCancel }) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  const confirmClass =
    confirmColor === "rose"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-slate-900">{title}</h3>
        <p className="mb-5 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${confirmClass}`}
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

// ======================================================================
// محرّر مواعيد أسبوعية متكررة — قائمة صفوف (يوم + وقت) قابلة للإضافة والحذف
// ======================================================================
function ScheduleEditor({ value, onChange }) {
  function addRow() {
    onChange([...value, { day: 6, time: "16:00" }]); // افتراضي: السبت 4 عصراً
  }

  function updateRow(index, patch) {
    const next = value.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function removeRow(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={row.day}
            onChange={(e) => updateRow(index, { day: Number(e.target.value) })}
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            {DAY_NAMES_AR.map((name, dayIndex) => (
              <option key={dayIndex} value={dayIndex}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={row.time}
            onChange={(e) => updateRow(index, { time: e.target.value })}
            className="w-32 rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            aria-label="حذف الموعد"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <CloseIcon />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
      >
        + إضافة يوم وموعد
      </button>
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
    hasError ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-indigo-400",
  ].join(" ");
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
        active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ count, muted }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        muted ? "bg-slate-200 text-slate-500" : "bg-white/20 text-white"
      }`}
    >
      {count}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
