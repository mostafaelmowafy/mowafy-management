// src/lib/points.js
// إعدادات نقاط التقييم العامة (الأوزان النسبية للحضور/التفاعل/الواجب/التسميع/الامتحان)
// عامة وثابتة على مستوى التطبيق كله، وليست لكل حصة — تُخزَّن في localStorage
// وتُدار من شاشة الإعدادات، وتقرأها شاشة التقييم عند حساب الدرجة.

const POINTS_SETTINGS_KEY = "cms_points_settings";
export const DEFAULT_POINTS = { attendance: 4, participation: 1, homework: 2, recitation: 2, exam: 5 };

export function loadPointsSettings() {
  try {
    const raw = localStorage.getItem(POINTS_SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(POINTS_SETTINGS_KEY, JSON.stringify(DEFAULT_POINTS));
      return DEFAULT_POINTS;
    }
    const saved = JSON.parse(raw);
    // دمج حقل بحقل (وليس مجرد spread) — لو أي بند جديد (زي "تسميع") أُضيف في نسخة
    // أحدث من التطبيق ومحفوظاتك القديمة معندهاش قيمة له إطلاقاً (undefined بدل
    // رقم)، يرجع لقيمته الافتراضية بدل ما يفضل undefined أو يتجاهله أي حساب لاحق
    const merged = { ...DEFAULT_POINTS };
    for (const key of Object.keys(DEFAULT_POINTS)) {
      if (typeof saved[key] === "number") merged[key] = saved[key];
    }
    return merged;
  } catch {
    return DEFAULT_POINTS;
  }
}

export function savePointsSettings(patch) {
  const current = loadPointsSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(POINTS_SETTINGS_KEY, JSON.stringify(next));
  return next;
}
