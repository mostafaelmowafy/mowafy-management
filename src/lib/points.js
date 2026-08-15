// src/lib/points.js
// إعدادات نقاط التقييم العامة (الأوزان النسبية للحضور/التفاعل/الواجب/الامتحان)
// عامة وثابتة على مستوى التطبيق كله، وليست لكل حصة — تُخزَّن في localStorage
// وتُدار من شاشة الإعدادات، وتقرأها شاشة التقييم عند حساب الدرجة.

const POINTS_SETTINGS_KEY = "cms_points_settings";
export const DEFAULT_POINTS = { attendance: 4, participation: 1, homework: 2, exam: 5 };

export function loadPointsSettings() {
  try {
    const raw = localStorage.getItem(POINTS_SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(POINTS_SETTINGS_KEY, JSON.stringify(DEFAULT_POINTS));
      return DEFAULT_POINTS;
    }
    return { ...DEFAULT_POINTS, ...JSON.parse(raw) };
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
