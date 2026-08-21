// src/components/Settings.jsx
// شاشة الإعدادات: إدارة قوالب الواتساب + النسخ الاحتياطي والاستيراد

import React, { useRef, useState } from "react";
import { exportAllData, importAllData, todayStr } from "../db/db";
import {
  CATEGORIES,
  TEMPLATE_VARIABLES,
  loadTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  setDefaultTemplate,
} from "../lib/whatsappTemplates";
import { loadReminderSettings, saveReminderSettings } from "../lib/reminders";
import { loadSubjects, addSubject, deleteSubject } from "../lib/subjects";
import { loadPointsSettings, savePointsSettings, DEFAULT_POINTS } from "../lib/points";
import { mergeImportedData } from "../lib/merge";

export default function Settings({ onDone }) {
  return (
    <div dir="rtl" className="min-h-screen bg-white font-sans text-stone-900">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-900">الإعدادات</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              العودة
            </button>
          )}
        </header>

        <div className="space-y-6">
          <PointsSection />
          <RemindersSection />
          <SubjectsSection />
          <TemplatesSection />
          <BackupSection />
          <MergeSection />
        </div>
      </div>
    </div>
  );
}

// ========================================================================
// قسم: نقاط التقييم (الأوزان النسبية للحضور/التفاعل/الواجب/الامتحان)
// ========================================================================
function PointsSection() {
  const [points, setPoints] = useState(loadPointsSettings);

  function update(field, value) {
    // نسمح بالحقل فاضي مؤقتاً أثناء الكتابة، ونحوّله لرقم صحيح غير سالب عند الحفظ
    const numeric = value === "" ? "" : Math.max(0, Number(value) || 0);
    const next = savePointsSettings({ [field]: numeric === "" ? 0 : numeric });
    setPoints(next);
  }

  const maxTotal =
    (points.attendance || 0) +
    (points.participation || 0) +
    (points.homework || 0) +
    (points.recitation || 0) +
    (points.exam || 0);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">نقاط التقييم</h2>
      <p className="mb-4 text-xs text-stone-500">
        الوزن النسبي لكل بند في معادلة تقييم الحصة (من 10). التغيير هنا يطبَّق فوراً على كل
        حسابات شاشة "تقييم الحصة" — القيم الافتراضية: حضور {DEFAULT_POINTS.attendance}،
        تفاعل {DEFAULT_POINTS.participation}، واجب {DEFAULT_POINTS.homework}، تسميع{" "}
        {DEFAULT_POINTS.recitation}، امتحان {DEFAULT_POINTS.exam}. كل بند (عدا الحضور) يقدر
        المدرس يفعّله أو يعطّله لحصة بعينها من شاشة التقييم نفسها.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <PointField label="الحضور" value={points.attendance} onChange={(v) => update("attendance", v)} />
        <PointField label="التفاعل" value={points.participation} onChange={(v) => update("participation", v)} />
        <PointField label="الواجب" value={points.homework} onChange={(v) => update("homework", v)} />
        <PointField label="التسميع" value={points.recitation} onChange={(v) => update("recitation", v)} />
        <PointField label="الامتحان" value={points.exam} onChange={(v) => update("exam", v)} />
      </div>

      <p className="mt-3 text-xs text-stone-500">
        أقصى مجموع ممكن للحصة (كل البنود مفعّلة): <strong>{maxTotal}</strong>
      </p>
    </section>
  );
}

function PointField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-stone-200 px-2.5 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}

// ========================================================================
// قسم: التنبيهات قبل كل حصة
// ========================================================================
function RemindersSection() {
  const [settings, setSettings] = useState(loadReminderSettings);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  function update(patch) {
    const next = saveReminderSettings(patch);
    setSettings(next);
  }

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">التنبيه قبل كل حصة</h2>
      <p className="mb-4 text-xs text-stone-500">
        تنبيه داخل التطبيق يظهر قبل كل موعد بالمدة اللي تحددها، بناءً على مواعيد المجموعات
        المُسجَّلة في شاشة "إدارة المجموعات". يعمل طالما المتصفح مفتوح (ولو في الخلفية على
        أندرويد غالباً)؛ على iOS قد يكون أقل ثباتاً لأن أنظمة أبل تُقيّد تنبيهات الويب في الخلفية.
      </p>

      <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
        <span className="text-sm font-medium text-stone-900">تفعيل التنبيه</span>
        <ToggleSwitch checked={settings.enabled} onChange={(checked) => update({ enabled: checked })} />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-stone-900">
          التنبيه قبل الموعد بـ
        </label>
        <select
          value={settings.minutesBefore}
          onChange={(e) => update({ minutesBefore: Number(e.target.value) })}
          disabled={!settings.enabled}
          className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50 disabled:text-stone-400"
        >
          <option value={5}>5 دقائق</option>
          <option value={15}>15 دقيقة</option>
          <option value={30}>30 دقيقة</option>
          <option value={60}>ساعة</option>
        </select>
      </div>

      {permission !== "unsupported" && (
        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5">
          <span className="text-xs text-stone-500">
            {permission === "granted"
              ? "إشعارات المتصفح مفعّلة ✅"
              : permission === "denied"
              ? "تم رفض إذن الإشعارات من إعدادات المتصفح"
              : "لتلقّي إشعار حتى لو التطبيق في الخلفية، فعّل إذن إشعارات المتصفح"}
          </span>
          {permission === "default" && (
            <button
              onClick={handleEnableNotifications}
              className="shrink-0 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
            >
              تفعيل
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ========================================================================
// قسم: المواد الدراسية (للمدرّس اللي بيدرّس أكتر من مادة، زي تفسير/فقه/حديث)
// ========================================================================
function SubjectsSection() {
  const [subjects, setSubjects] = useState(loadSubjects);
  const [newSubject, setNewSubject] = useState("");

  function handleAdd(e) {
    e.preventDefault();
    if (!newSubject.trim()) return;
    setSubjects(addSubject(newSubject));
    setNewSubject("");
  }

  function handleDelete(name) {
    setSubjects(deleteSubject(name));
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">المواد الدراسية</h2>
      <p className="mb-4 text-xs text-stone-500">
        لو بتدرّس أكتر من مادة (تفسير، فقه، حديث...)، أضِفها هنا. هيظهر بعدها اختيار "المادة"
        في أعلى شاشة التقييم — قابل للتغيير يوم بيوم زي بالظبط خيار الامتحان. لو القائمة فاضية،
        هذا الاختيار مش هيظهر خالص (مفيد لو بتدرّس مادة واحدة فقط ومش عايز خطوة إضافية).
      </p>

      {subjects.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-full bg-amber-50 py-1 pl-1.5 pr-3 text-xs font-semibold text-amber-900"
            >
              {s}
              <button
                onClick={() => handleDelete(s)}
                aria-label={`حذف ${s}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100 hover:text-amber-800"
              >
                <SmallCloseIcon />
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          placeholder="مثال: تفسير"
          className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900"
        >
          إضافة
        </button>
      </form>
    </section>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
        checked ? "bg-amber-800" : "bg-stone-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "right-0.5" : "right-[22px]"
        }`}
      />
    </button>
  );
}

function SmallCloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ========================================================================
// قسم 1: إدارة قوالب الواتساب
// ========================================================================
function TemplatesSection() {
  const [activeCategory, setActiveCategory] = useState("payment_reminder");
  const [templates, setTemplates] = useState(loadTemplates);
  const [editingTemplate, setEditingTemplate] = useState(null); // null = مغلق، {} = قالب جديد، {...} = تعديل

  function refresh() {
    setTemplates(loadTemplates());
  }

  const categoryTemplates = templates.filter((t) => t.category === activeCategory);

  function handleSetDefault(id) {
    setDefaultTemplate(activeCategory, id);
    refresh();
  }

  function handleDelete(id) {
    if (categoryTemplates.length <= 1) {
      // نمنع حذف آخر قالب في الفئة حتى لا تبقى الفئة بلا أي قالب افتراضي
      return;
    }
    deleteTemplate(id);
    refresh();
  }

  function handleSave(data) {
    if (data.id) {
      updateTemplate(data.id, { name: data.name, body: data.body });
    } else {
      addTemplate(activeCategory, data.name, data.body);
    }
    setEditingTemplate(null);
    refresh();
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">قوالب رسائل الواتساب</h2>
      <p className="mb-4 text-xs text-stone-500">
        القالب المحدد بالراديو هو القالب "الافتراضي" الذي سيُستخدم فعلياً عند إرسال الرسائل
        من شاشتَي التقييم والمدفوعات.
      </p>

      {/* تبويبات الفئات */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(CATEGORIES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeCategory === key
                ? "bg-amber-800 text-white"
                : "bg-stone-50 text-stone-500 hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* قائمة القوالب في الفئة الحالية */}
      <div className="space-y-2">
        {categoryTemplates.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 p-3"
          >
            <label className="flex flex-1 cursor-pointer items-start gap-2">
              <input
                type="radio"
                name={`default-${activeCategory}`}
                checked={t.isDefault}
                onChange={() => handleSetDefault(t.id)}
                className="mt-1 h-4 w-4 shrink-0 text-amber-800 focus:ring-amber-200"
              />
              <span>
                <span className="block text-sm font-semibold text-stone-900">
                  {t.name} {t.isDefault && <BadgeDefault />}
                </span>
                <span className="mt-0.5 block whitespace-pre-line text-xs text-stone-500">
                  {t.body}
                </span>
              </span>
            </label>

            <div className="flex shrink-0 gap-1">
              <IconButton label="تعديل" onClick={() => setEditingTemplate(t)}>
                <EditIcon />
              </IconButton>
              <IconButton
                label="حذف"
                onClick={() => handleDelete(t.id)}
                disabled={categoryTemplates.length <= 1}
              >
                <TrashIcon />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setEditingTemplate({ category: activeCategory, name: "", body: "" })}
        className="mt-3 w-full rounded-lg border border-dashed border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-500 hover:border-amber-800 hover:text-amber-800"
      >
        + إضافة قالب جديد لهذه الفئة
      </button>

      {editingTemplate && (
        <TemplateEditor
          initial={editingTemplate}
          onCancel={() => setEditingTemplate(null)}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------------------
// محرّر قالب (نافذة منبثقة) — يدعم إدراج المتغيرات عند موضع المؤشر في النص
// ------------------------------------------------------------------------
function TemplateEditor({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [body, setBody] = useState(initial.body || "");
  const textareaRef = useRef(null);

  function insertVariable(variable) {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const newBody = body.slice(0, start) + variable + body.slice(end);
    setBody(newBody);

    // إعادة وضع المؤشر بعد المتغيّر المُدرَج فور تحديث الواجهة
    requestAnimationFrame(() => {
      el.focus();
      const cursorPos = start + variable.length;
      el.selectionStart = el.selectionEnd = cursorPos;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    onSave({ id: initial.id, name, body });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="mb-4 text-base font-bold text-stone-900">
          {initial.id ? "تعديل القالب" : "قالب جديد"}
        </h3>

        <label className="mb-1.5 block text-sm font-medium text-stone-900">اسم القالب</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: تذكير ودّي"
          className="mb-4 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
        />

        <label className="mb-1.5 block text-sm font-medium text-stone-900">نص الرسالة</label>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="mb-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
        />

        <p className="mb-1.5 text-xs text-stone-500">
          اضغط على أي متغيّر لإضافته في مكان المؤشر داخل النص:
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900"
          >
            حفظ القالب
          </button>
          <button
            type="button"
            onClick={onCancel}
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
// قسم 2: النسخ الاحتياطي والاستيراد
// ========================================================================
function BackupSection() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
  const [confirmingImport, setConfirmingImport] = useState(null); // الملف الذي يتم تأكيده
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const payload = await exportAllData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup-${todayStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      localStorage.setItem("cms_last_backup_at", new Date().toISOString());
      setStatus({ type: "success", message: "تم تصدير النسخة الاحتياطية بنجاح." });
    } catch {
      setStatus({ type: "error", message: "تعذّر تصدير البيانات. حاول مجدداً." });
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmingImport(file);
    e.target.value = ""; // للسماح باختيار نفس الملف مرة أخرى لاحقاً إن لزم
  }

  async function confirmImport() {
    if (!confirmingImport) return;
    setBusy(true);
    try {
      const text = await confirmingImport.text();
      const payload = JSON.parse(text);
      await importAllData(payload);
      setStatus({ type: "success", message: "تم استرجاع البيانات بنجاح. قد تحتاج لإعادة تحميل الصفحة." });
    } catch {
      setStatus({ type: "error", message: "الملف غير صالح أو تالف. لم يتم تغيير أي بيانات." });
    } finally {
      setBusy(false);
      setConfirmingImport(null);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">النسخ الاحتياطي والاستيراد</h2>
      <p className="mb-4 text-xs text-stone-500">
        كل بياناتك محفوظة محلياً على هذا الجهاز فقط. خذ نسخة احتياطية بانتظام لتفادي فقدانها
        عند تغيير الجهاز أو مسح بيانات المتصفح.
      </p>

      {status && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            status.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className="rounded-lg bg-amber-800 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
        >
          {busy ? "جارِ العمل..." : "تصدير نسخة احتياطية (JSON)"}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-50 disabled:opacity-60"
        >
          استيراد نسخة احتياطية (استبدال كامل)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleFileSelected}
          className="hidden"
        />
      </div>

      {confirmingImport && (
        <ConfirmDialog
          title="استيراد نسخة احتياطية؟"
          message={
            <>
              سيتم <strong>حذف كل البيانات الحالية</strong> (الطلاب، المجموعات، الحضور، التقييم،
              المدفوعات) واستبدالها بالكامل ببيانات الملف "<strong>{confirmingImport.name}</strong>".
              هذا الإجراء لا يمكن التراجع عنه — تأكد أنك تملك نسخة احتياطية من البيانات الحالية إن
              أردت الاحتفاظ بها.
            </>
          }
          confirmLabel="نعم، احذف واستورد"
          onConfirm={confirmImport}
          onCancel={() => setConfirmingImport(null)}
        />
      )}
    </section>
  );
}

// ========================================================================
// قسم: دمج البيانات — لتوحيد تقييمات تمت على أجهزة مختلفة بدون فقد أي بيانات
// ========================================================================
function MergeSection() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [confirmingMerge, setConfirmingMerge] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmingMerge(file);
    e.target.value = "";
  }

  async function confirmMerge() {
    if (!confirmingMerge) return;
    setBusy(true);
    try {
      const text = await confirmingMerge.text();
      const payload = JSON.parse(text);
      const stats = await mergeImportedData(payload);
      setStatus({
        type: "success",
        message: `تم الدمج بنجاح: ${stats.groups} مجموعة جديدة، ${stats.students} طالب جديد، ${stats.attendance} سجل حضور، ${stats.tasks} بند تقييم، ${stats.payments} دفعة، ${stats.sessions} إعداد حصة — كل ما كان موجوداً بالفعل تُرك كما هو بدون تكرار.`,
      });
    } catch {
      setStatus({ type: "error", message: "الملف غير صالح أو تالف. لم يتم تغيير أي بيانات." });
    } finally {
      setBusy(false);
      setConfirmingMerge(null);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-stone-900">دمج البيانات</h2>
      <p className="mb-4 text-xs text-stone-500">
        لو بتسجّل حضور أو تقييم على أكتر من جهاز (موبايل وتابلت مثلاً) في نفس اليوم، استخدم
        "دمج البيانات" بدل "استيراد نسخة احتياطية". الدمج <strong>يضيف فقط</strong> ما هو جديد
        (مجموعات، طلاب، حضور، تقييم، مدفوعات غير موجودة بالفعل) ولا يحذف ولا يستبدل أي شيء
        عندك حالياً — مطابقة الطلاب تتم عبر كود QR الفريد لكل طالب، ومطابقة السجلات اليومية
        عبر التاريخ، فلا يتكرر أي سجل موجود بالفعل.
      </p>

      {status && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm leading-relaxed ${
            status.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {status.message}
        </div>
      )}

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="w-full rounded-lg border border-amber-800 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60 sm:w-auto"
      >
        {busy ? "جارِ الدمج..." : "دمج ملف نسخة احتياطية"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileSelected}
        className="hidden"
      />

      {confirmingMerge && (
        <ConfirmDialog
          title="دمج البيانات؟"
          message={
            <>
              سيتم دمج بيانات الملف "<strong>{confirmingMerge.name}</strong>" مع بياناتك الحالية —
              أي مجموعة أو طالب أو سجل يوم موجود بالفعل (نفس التاريخ) <strong>لن يتكرر</strong>،
              وأي شيء جديد فقط هو اللي هيتضاف. هذا آمن ولا يحذف أي بيانات موجودة عندك.
            </>
          }
          confirmLabel="نعم، ادمج البيانات"
          onConfirm={confirmMerge}
          onCancel={() => setConfirmingMerge(null)}
        />
      )}
    </section>
  );
}

// ========================================================================
// مكوّنات مساعدة مشتركة
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
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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

function BadgeDefault() {
  return (
    <span className="mr-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
      افتراضي
    </span>
  );
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
