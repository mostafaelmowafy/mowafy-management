// src/lib/schedule.js
// حساب مواعيد الحصص الأسبوعية المتكررة لكل مجموعة (مثال: كل سبت وثلاثاء الساعة 4 عصراً)
// لا يحتاج أي تعديل في Dexie schema — نخزّن `schedule` كحقل عادي (غير مفهرَس) على
// سجل المجموعة في db.groups، وهو مصفوفة: [{ day: 0-6, time: "16:00" }, ...]
// day: 0 = الأحد ... 6 = السبت (نفس ترتيب Date.getDay() في JavaScript)

import { db } from "../db/db";

export const DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

// مدة بقاء الحصة "شغّالة" في لوحة التحكم بعد موعدها المحدَّد — بعدها تختفي ويظهر
// بدلاً منها التكرار القادم للمجموعة نفسها الأسبوع التالي
export const SESSION_ACTIVE_WINDOW_MINUTES = 90;

/**
 * أقرب موعد "ذو صلة" لحصة متكررة (يوم أسبوعي + وقت)، بدءاً من لحظة `from`.
 * `graceMinutes`: لو موعد اليوم فات لكن ضمن فترة السماح، يظل يُعتبر "الموعد الحالي"
 * (مهم لعرض زر "ابدأ الحصة" لفترة بعد بداية الميعاد، وليس فقط قبله). بعد انتهاء
 * فترة السماح، يُحسَب الموعد القادم تلقائياً (الأسبوع التالي).
 */
export function getNextOccurrence(dayOfWeek, timeStr, from = new Date(), graceMinutes = 0) {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  const result = new Date(from);
  result.setHours(h, m, 0, 0);

  let diffDays = (dayOfWeek - from.getDay() + 7) % 7;
  if (diffDays === 0) {
    const minutesSinceStart = (from.getTime() - result.getTime()) / 60000;
    if (minutesSinceStart > graceMinutes) {
      diffDays = 7; // فات الموعد وفترة السماح، ننتقل للتكرار القادم
    }
  }
  result.setDate(result.getDate() + diffDays);
  return result;
}

/**
 * كل المواعيد القادمة أو الجارية حالياً (ضمن فترة السماح)، مرتّبة من الأقرب فالأبعد.
 * موعد "جارٍ الآن" (بدأ لكن لسه ضمن فترة السماح) يظل يظهر هنا بدل القفز للأسبوع القادم،
 * حتى يقدر المدرس يضغط "ابدأ الحصة" حتى لو دخل التطبيق بعد بداية الحصة بشوية.
 */
export async function getUpcomingSessions(limit = 5) {
  const groups = await db.groups.where("isArchived").equals(0).toArray();
  const now = new Date();
  const occurrences = [];

  groups.forEach((g) => {
    (g.schedule || []).forEach((slot) => {
      const date = getNextOccurrence(slot.day, slot.time, now, SESSION_ACTIVE_WINDOW_MINUTES);
      occurrences.push({
        groupId: g.id,
        groupName: g.groupName,
        day: slot.day,
        time: slot.time,
        date,
        isActive: now.getTime() >= date.getTime(), // الموعد بدأ فعلاً وما زال ضمن فترة السماح
      });
    });
  });

  occurrences.sort((a, b) => a.date - b.date);
  return occurrences.slice(0, limit);
}

/** نص عربي مختصر يصف موعداً نسبياً للحظة الحالية: "اليوم 4:00 م" / "غداً 4:00 م" / "الثلاثاء 4:00 م" */
export function formatSessionWhen(date, now = new Date()) {
  const time = formatTimeAr(date);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);

  if (diffDays === 0) return `اليوم — ${time}`;
  if (diffDays === 1) return `غداً — ${time}`;
  return `${DAY_NAMES_AR[date.getDay()]} — ${time}`;
}

/** نص عدّاد تنازلي مبسّط: "خلال 20 دقيقة" / "خلال 3 ساعات" */
export function formatCountdown(date, now = new Date()) {
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return "الآن";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `خلال ${diffMin} دقيقة`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `خلال ${diffHours} ${diffHours === 1 ? "ساعة" : "ساعات"}`;
  const diffDaysCount = Math.round(diffHours / 24);
  return `خلال ${diffDaysCount} ${diffDaysCount === 1 ? "يوم" : "أيام"}`;
}

function formatTimeAr(date) {
  return date.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit", hour12: true });
}
