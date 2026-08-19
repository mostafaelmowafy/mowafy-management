// src/db/db.js
// إعداد قاعدة البيانات المحلية باستخدام Dexie.js (طبقة فوق IndexedDB)
// كل البيانات تبقى على جهاز المدرس فقط - لا يوجد أي اتصال بخادم خارجي.

import Dexie from "dexie";

export const db = new Dexie("ClassManagementDB");

// ------------------------------------------------------------------
// تعريف الجداول (Schema)
// ملاحظة: في Dexie، أول حقل هو المفتاح الأساسي (++id يعني رقم تلقائي)
// الحقول الأخرى المذكورة هي الحقول التي نريد فهرستها (index) للبحث السريع
// لا حاجة لذكر كل الحقول، فقط التي سنستخدمها في where()/orderBy()
// ------------------------------------------------------------------
db.version(1).stores({
  students:
    "++id, name, phone, parentPhone, groupId, qrCode, isArchived, createdAt",

  groups: "++id, groupName, academicYear, isArchived, createdAt",

  // فهرس مركب [studentId+date] لمنع تكرار تسجيل حضور نفس الطالب في نفس اليوم
  attendance: "++id, studentId, date, status, [studentId+date]",

  tasks: "++id, studentId, details, score, isExcused, createdAt",

  // فهرس مركب [studentId+month] لتسهيل حساب إجمالي مدفوعات الطالب في شهر معين
  payments: "++id, studentId, amount, month, paymentDate, [studentId+month]",
});

// ------------------------------------------------------------------
// النسخة 2: توسيع جدول tasks ليدعم "بنود تقييم يومية" (تفاعل/واجب/امتحان)
// مربوطة بحصة محددة (مجموعة + تاريخ)، بالإضافة لجدول جديد "sessions"
// يخزّن إعدادات كل حصة (هل يوجد امتحان؟ وما الدرجة النهائية لورقته؟).
// هذا التوسيع ضروري لشاشة التقييم (Evaluations.jsx) كي يمكن تمييز تفاعل/واجب
// يوم الأحد عن تفاعل/واجب يوم الثلاثاء لنفس الطالب.
// ------------------------------------------------------------------
db.version(2).stores({
  // [studentId+date+kind] يسمح بإيجاد/تحديث بند تقييم بعينه لطالب في تاريخ معيّن بسرعة
  // kind: 'participation' | 'homework' | 'exam'
  tasks:
    "++id, studentId, groupId, date, kind, isExcused, [studentId+date+kind]",

  // [groupId+date] = إعدادات حصة واحدة لمجموعة في يوم معيّن (hasExam, examTotal)
  sessions: "++id, groupId, date, hasExam, examTotal, [groupId+date]",
});

// ------------------------------------------------------------------
// Hook تلقائي: توليد كود QR فريد + تاريخ إنشاء عند إضافة طالب جديد
// ------------------------------------------------------------------
db.students.hook("creating", (primKey, obj) => {
  obj.createdAt = obj.createdAt || new Date().toISOString();
  // ملاحظة: نستخدم 0/1 وليس false/true، لأن IndexedDB لا يدعم Boolean كنوع
  // صالح للفهرسة (Index Key) — تخزين true/false مباشرة قد يجعل السجل غير
  // مفهرَس إطلاقاً، فتفشل استعلامات .where("isArchived").equals(0) بصمت.
  obj.isArchived = obj.isArchived === 1 ? 1 : 0;
  // كود بسيط وفريد يُستخدم لتوليد QR (يمكن استبداله بـ uuid عند الحاجة)
  obj.qrCode =
    obj.qrCode || `STU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  // أشهر مستثناة من التقييم التراكمي (اختياري) — [{"2026-08"}, ...] حقل عادي غير مفهرَس
  obj.excludedMonths = obj.excludedMonths || [];
  // أشهر مُعفاة من مصروفات الاشتراك (اختياري ومختلف تماماً عن الاستثناء أعلاه —
  // هذا يخص المالية، ذاك يخص التقييم) — نفس شكل التخزين [{"2026-08"}, ...]
  obj.feeExemptMonths = obj.feeExemptMonths || [];
});

db.groups.hook("creating", (primKey, obj) => {
  obj.createdAt = obj.createdAt || new Date().toISOString();
  obj.isArchived = obj.isArchived === 1 ? 1 : 0; // نفس سبب استخدام 0/1 أعلاه
  // مواعيد أسبوعية متكررة: [{ day: 0-6, time: "16:00" }, ...] — حقل عادي غير مفهرَس
  // (لا يحتاج تعديل Dexie schema)، افتراضياً فاضي حتى يضيفها المدرس من شاشة المجموعات
  obj.schedule = obj.schedule || [];
  // الرسم الشهري المتوقَّع لكل طالب في هذه المجموعة (اختياري) — يُستخدم في شاشة
  // "المالية" لحساب المتوقع تحصيله مقابل المُحصَّل فعلياً. 0 = غير محدَّد
  obj.monthlyFee = obj.monthlyFee || 0;
});

// ==================================================================
// دوال مساعدة (Helpers) تُستخدم في لوحة التحكم وبقية الشاشات
// ==================================================================

/** تاريخ اليوم بصيغة YYYY-MM-DD (نفس صيغة حقل date في جدول attendance) */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** الشهر الحالي بصيغة YYYY-MM (نفس صيغة حقل month في جدول payments) */
export function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * عدد الطلاب النشطين (غير المؤرشفين) الذين من المتوقع حضورهم اليوم.
 * حالياً: كل الطلاب النشطين في مجموعات نشطة (يمكن لاحقاً ربطها بجدول أيام المجموعة)
 */
export async function getExpectedStudentsToday() {
  const activeGroups = await db.groups.where("isArchived").equals(0).toArray();
  const activeGroupIds = new Set(activeGroups.map((g) => g.id));

  const activeStudents = await db.students
    .where("isArchived")
    .equals(0)
    .toArray();

  return activeStudents.filter((s) => activeGroupIds.has(s.groupId)).length;
}

/** عدد الطلاب الذين سُجّل حضورهم فعلياً اليوم (status = Present) */
export async function getPresentTodayCount() {
  const today = todayStr();
  const records = await db.attendance
    .where("date")
    .equals(today)
    .and((r) => r.status === "Present")
    .toArray();
  return records.length;
}

/**
 * الطلاب "المتأخرين عن الدفع" لشهر معيّن (افتراضياً الشهر الحالي).
 * الطالب يُعتبر متأخراً إن لم يوجد له أي سجل دفع في هذا الشهر — باستثناء الطلاب
 * المُعفَين صراحةً من مصروفات هذا الشهر تحديداً (student.feeExemptMonths).
 */
export async function getLatePaymentStudents(month = currentMonthStr()) {
  const activeStudents = await db.students
    .where("isArchived")
    .equals(0)
    .toArray();

  const monthPayments = await db.payments
    .where("month")
    .equals(month)
    .toArray();

  const paidStudentIds = new Set(monthPayments.map((p) => p.studentId));

  return activeStudents.filter(
    (s) => !paidStudentIds.has(s.id) && !(s.feeExemptMonths || []).includes(month)
  );
}

/** إجمالي ما دفعه طالب معيّن عبر كل الأشهر */
export async function getStudentTotalPaid(studentId) {
  const payments = await db.payments.where("studentId").equals(studentId).toArray();
  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/** إجمالي دخل مجموعة معينة خلال شهر معيّن */
export async function getGroupIncome(groupId, month = currentMonthStr()) {
  const students = await db.students.where("groupId").equals(groupId).toArray();
  const studentIds = new Set(students.map((s) => s.id));

  const monthPayments = await db.payments.where("month").equals(month).toArray();

  return monthPayments
    .filter((p) => studentIds.has(p.studentId))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/** الإجمالي العام لكل المجاميع خلال شهر معيّن */
export async function getTotalIncome(month = currentMonthStr()) {
  const monthPayments = await db.payments.where("month").equals(month).toArray();
  return monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/**
 * ملاحظة: دالة حساب تقييم الطالب التراكمي انتقلت إلى src/lib/scoring.js
 * (getStudentDailyScores + averageScore)، لأنها بحاجة تُعيد بناء نفس معادلة
 * "تقييم الحصة" الفعلية (النقاط القابلة للتعديل، نظام النجوم، الامتحان
 * الاختياري لكل حصة) بدل معادلة مبسَّطة منفصلة قد تُعطي رقماً مختلفاً عن
 * الدرجة الحقيقية المعروضة في شاشة التقييم.
 */

// ======================================================================
// النسخ الاحتياطي والاستيراد (تُستخدم في شاشة الإعدادات ولوحة التحكم)
// ======================================================================

const ALL_TABLES = ["students", "groups", "attendance", "tasks", "payments", "sessions"];

/** يجمع كل جداول Dexie في كائن واحد جاهز للتصدير كملف JSON */
export async function exportAllData() {
  const [students, groups, attendance, tasks, payments, sessions] = await Promise.all(
    ALL_TABLES.map((name) => db[name].toArray())
  );
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: db.verno,
    students,
    groups,
    attendance,
    tasks,
    payments,
    sessions,
  };
}

/**
 * يفرّغ كل الجداول الحالية ثم يستعيد البيانات من نسخة احتياطية (نفس شكل exportAllData).
 * نستخدم bulkPut (وليس bulkAdd) مع الاحتفاظ بحقول id الأصلية عمداً، لأن سجلات
 * الحضور/المهام/المدفوعات تشير إلى studentId وgroupId بالـ id القديم نفسه —
 * توليد ids جديدة كان سيكسر كل هذه الروابط بين الجداول.
 */
export async function importAllData(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("ملف النسخة الاحتياطية غير صالح");
  }

  await db.transaction("rw", ALL_TABLES.map((name) => db[name]), async () => {
    for (const name of ALL_TABLES) {
      await db[name].clear();
      const rows = Array.isArray(payload[name]) ? payload[name] : [];
      if (rows.length > 0) {
        await db[name].bulkPut(rows);
      }
    }
  });
}

export default db;

