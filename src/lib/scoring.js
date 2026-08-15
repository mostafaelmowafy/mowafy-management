// src/lib/scoring.js
// محرّك حساب تقييم الحصة — نفس المعادلة المستخدمة في شاشة "تقييم الحصة" بالضبط،
// مستخرجة هنا كوحدة مشتركة حتى تقدر شاشة "الإحصائيات" تحسب نفس الدرجات تماماً
// عند تجميعها عبر أيام/أشهر متعددة، بدل تكرار نفس المنطق في مكانين قد يختلفا لاحقاً.

import { db } from "../db/db";
import { loadPointsSettings } from "./points";

// ----------------------------------------------------------------------
// معادلة الحساب المرنة — نظام النجوم (من 5) لكل من التفاعل والواجب
// ----------------------------------------------------------------------
// قيمة النجمة الواحدة لبند ما = (النقاط القصوى المخصصة للبند) / 5
// نقاط الطالب في البند = (عدد النجوم / 5) × النقاط القصوى للبند
// "مستثنى" يعطي الدرجة الكاملة (5 نجوم/النقاط القصوى) بغض النظر عن عدد النجوم المُسجَّل
export function starPoints(stars, maxPoints, isExcused) {
  if (isExcused) return maxPoints;
  const clampedStars = Math.max(0, Math.min(5, Number(stars) || 0));
  return (clampedStars / 5) * maxPoints;
}

export function computeSessionScore({ points, hasExam, examTotal, attendance, participation, homework, exam }) {
  let available = points.attendance + points.participation + points.homework;
  if (hasExam) available += points.exam;

  let earned = 0;

  // الحضور: حاضر أو مستثنى = النقاط كاملة، غائب = صفر
  if (attendance === "Present" || attendance === "Excused") {
    earned += points.attendance;
  }

  // التفاعل والواجب: نظام النجوم (من 5)
  earned += starPoints(participation.stars, points.participation, participation.isExcused);
  earned += starPoints(homework.stars, points.homework, homework.isExcused);

  // الامتحان (فقط إن وُجد في الحصة)
  if (hasExam) {
    const total = Number(examTotal);
    if (exam.isExcused) {
      earned += points.exam;
    } else if (total > 0 && exam.score !== "" && exam.score !== null && exam.score !== undefined) {
      const ratio = Math.min(Number(exam.score) / total, 1);
      earned += ratio * points.exam;
    }
  }

  const scoreOutOf10 = available > 0 ? (earned / available) * 10 : 0;
  return { earned, available, scoreOutOf10: Number(scoreOutOf10.toFixed(2)) };
}

/**
 * كل درجات طالب معيّن يوماً بيوم — تُعاد بناء إعدادات كل يوم (هل كان فيه امتحان؟
 * الدرجة النهائية؟) من db.sessions حسب المجموعة المرتبطة بسجلات ذلك اليوم تحديداً
 * (وليس مجموعة الطالب الحالية بالضرورة، احترازاً لو نُقل الطالب بين مجموعات).
 */
export async function getStudentDailyScores(studentId, fallbackGroupId = null) {
  const points = loadPointsSettings();

  const [attendanceRecords, taskRecords] = await Promise.all([
    db.attendance.where("studentId").equals(studentId).toArray(),
    db.tasks.where("studentId").equals(studentId).toArray(),
  ]);

  const allDates = new Set([
    ...attendanceRecords.map((r) => r.date),
    ...taskRecords.map((r) => r.date),
  ]);

  const sessionCache = new Map(); // "groupId-date" -> session (تفادي استعلامات مكررة لنفس اليوم

  const results = [];
  for (const date of allDates) {
    const attendance = attendanceRecords.find((r) => r.date === date)?.status || "Absent";
    const dayTasks = taskRecords.filter((t) => t.date === date);
    const participationTask = dayTasks.find((t) => t.kind === "participation");
    const homeworkTask = dayTasks.find((t) => t.kind === "homework");
    const examTask = dayTasks.find((t) => t.kind === "exam");

    const groupId = dayTasks[0]?.groupId ?? fallbackGroupId;

    let hasExam = false;
    let examTotal = "";
    if (groupId) {
      const cacheKey = `${groupId}-${date}`;
      let session = sessionCache.get(cacheKey);
      if (session === undefined) {
        session = await db.sessions.where("[groupId+date]").equals([groupId, date]).first();
        sessionCache.set(cacheKey, session || null);
      }
      hasExam = session?.hasExam ?? false;
      examTotal = session?.examTotal ?? "";
    }

    const participation = {
      stars: participationTask?.stars ?? 0,
      isExcused: !!participationTask?.isExcused,
    };
    const homework = { stars: homeworkTask?.stars ?? 0, isExcused: !!homeworkTask?.isExcused };
    const exam = { score: examTask?.score ?? "", isExcused: !!examTask?.isExcused };

    const { scoreOutOf10 } = computeSessionScore({
      points,
      hasExam,
      examTotal,
      attendance,
      participation,
      homework,
      exam,
    });

    results.push({ date, groupId, attendance, scoreOutOf10 });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** متوسط الدرجات ضمن قائمة سجلات (اختياري: فلترة بشهر معيّن بصيغة YYYY-MM) */
export function averageScore(dailyScores, month = null) {
  const filtered = month ? dailyScores.filter((d) => d.date.startsWith(month)) : dailyScores;
  if (filtered.length === 0) return null;
  const sum = filtered.reduce((s, d) => s + d.scoreOutOf10, 0);
  return Number((sum / filtered.length).toFixed(2));
}
