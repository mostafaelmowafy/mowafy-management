// src/lib/reminders.js
// إعدادات التنبيه قبل كل حصة + تتبّع "المواعيد المُتجاهَلة" (Dismissed) حتى لا يظهر
// نفس التنبيه أكثر من مرة لنفس الموعد بعد إغلاقه، ولا يظهر مجدداً إلا في التكرار القادم.
//
// ملاحظة مهمة وصادقة: هذا نظام تنبيه داخل التطبيق (In-app) يعمل طالما المتصفح/التطبيق
// مفتوح (ولو في الخلفية على أندرويد غالباً، وبشكل أقل ثباتاً على iOS). التطبيق يعمل بالكامل
// Offline بدون أي خادم، لذلك تنبيه push حقيقي يوصل حتى لو التطبيق مقفول تماماً غير متاح هنا —
// هذا يتطلب خادم إشعارات، وهو ما يتعارض مع فكرة "محلي بالكامل بدون سحابة".

const SETTINGS_KEY = "cms_reminder_settings";
const DISMISSED_KEY = "cms_dismissed_reminders";

const DEFAULT_SETTINGS = { enabled: true, minutesBefore: 15 };

export function loadReminderSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveReminderSettings(patch) {
  const current = loadReminderSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** مفتاح فريد لتكرار موعد مُحدَّد (مجموعة + تاريخ اليوم الفعلي لهذا التكرار) */
export function occurrenceKey(groupId, date) {
  return `${groupId}-${date.toISOString().slice(0, 10)}`;
}

function loadDismissed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(set) {
  // تنظيف تلقائي بسيط: نحتفظ بآخر 200 مفتاح فقط لمنع تضخّم التخزين مع الوقت
  const arr = Array.from(set).slice(-200);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
}

export function isDismissed(key) {
  return loadDismissed().has(key);
}

export function dismissOccurrence(key) {
  const set = loadDismissed();
  set.add(key);
  saveDismissed(set);
}
