// src/lib/scoring.js
// محرّك حساب تقييم الحصة — نفس المعادلة المستخدمة في شاشة "تقييم الحصة" بالضبط،
// مستخرجة هنا كوحدة مشتركة حتى تقدر شاشة "الإحصائيات" تحسب نفس الدرجات تماماً
// عند تجميعها عبر أيام/أشهر متعددة، بدل تكرار نفس المنطق في مكانين قد يختلفا لاحقاً.

import { db } from "../db/db";
import { loadPointsSettings } from "./points";

// ----------------------------------------------------------------------
// معادلة الحساب المرنة — نظام النجوم (من 5) لكل من التفاعل والواجب والتسميع
// ----------------------------------------------------------------------
// قيمة النجمة الواحدة لبند ما = (النقاط القصوى المخصصة للبند) / 5
// نقاط الطالب في البند = (عدد النجوم / 5) × النقاط القصوى للبند
// "مستثنى" يعطي الدرجة الكاملة (5 نجوم/النقاط القصوى) بغض النظر عن عدد النجوم المُسجَّل
export function starPoints(stars, maxPoints, isExcused) {
  if (isExcused) return maxPoints;
  const clampedStars = Math.max(0, Math.min(5, Number(stars) || 0));
  return (clampedStars / 5) * maxPoints;
}

/**
 * حساب درجة حصة واحدة من 10.
 * - الحضور: حاضر/مستثنى = النقاط كاملة، غائب = **نقاط بالسالب** (عقوبة حقيقية،
 *   مش مجرد صفر) — بطلب صريح: الغياب لازم يقلل التقييم فعلياً مش يجمّده بس.
 * - التفاعل/الواجب/التسميع: قابلين للتفعيل أو التعطيل لكل حصة (زي الامتحان تماماً)
 *   عبر hasParticipation/hasHomework/hasRecitation — لو أي بند متعطّل، نقاطه القصوى
 *   لا تدخل في "المتاح" أصلاً لهذه الحصة، ونظام النجوم بتاعه ما بيُحتسبش.
 */
export function computeSessionScore({
  points,
  hasExam,
  examTotal,
  hasParticipation = true,
  hasHomework = true,
  hasRecitation = true,
  attendance,
  participation,
  homework,
  recitation,
  exam,
}) {
  let available = points.attendance;
  if (hasParticipation) available += points.participation;
  if (hasHomework) available += points.homework;
  if (hasRecitation) available += points.recitation;
  if (hasExam) available += points.exam;

  let earned = 0;

  // الحضور: حاضر أو مستثنى = النقاط كاملة، غائب = نفس النقاط لكن بالسالب (عقوبة)
  if (attendance === "Present" || attendance === "Excused") {
    earned += points.attendance;
  } else if (attendance === "Absent") {
    earned -= points.attendance;
  }

  if (hasParticipation) {
    earned += starPoints(participation?.stars, points.participation, participation?.isExcused);
  }
  if (hasHomework) {
    earned += starPoints(homework?.stars, points.homework, homework?.isExcused);
  }
  if (hasRecitation) {
    earned += starPoints(recitation?.stars, points.recitation, recitation?.isExcused);
  }

  if (hasExam) {
    const total = Number(examTotal);
    if (exam?.isExcused) {
      earned += points.exam;
    } else if (total > 0 && exam?.score !== "" && exam?.score !== null && exam?.score !== undefined) {
      const ratio = Math.min(Number(exam.score) / total, 1);
      earned += ratio * points.exam;
    }
  }

  const rawScore = available > 0 ? (earned / available) * 10 : 0;
  // نمنع ظهور تقييم سالب لولي الأمر (مربك بصرياً)، لكن العقوبة نفسها أثّرت فعلياً
  // على "earned" الداخلية، فلو كانت العقوبة كبيرة كفاية هتوصل الدرجة لصفر بدل
  // ما تفضل مرتفعة بشكل غير منطقي كما لو كان الغياب "محايداً"
  const scoreOutOf10 = Math.max(0, Math.min(10, Number(rawScore.toFixed(2))));

  return { earned, available, scoreOutOf10 };
}

/**
 * كل درجات طالب معيّن يوماً بيوم، مع تفصيل كل بند على حدة (للإحصائيات).
 * تُعاد بناء إعدادات كل يوم (هل كان فيه امتحان؟ واجب؟ تسميع؟ تفاعل؟ الدرجة
 * النهائية؟ المادة؟) من db.sessions حسب المجموعة المرتبطة بسجلات ذلك اليوم
 * تحديداً (وليس مجموعة الطالب الحالية بالضرورة، احترازاً لو نُقل الطالب بين مجموعات).
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

  const sessionCache = new Map();

  const results = [];
  for (const date of allDates) {
    const attendance = attendanceRecords.find((r) => r.date === date)?.status || "Absent";
    const dayTasks = taskRecords.filter((t) => t.date === date);
    const participationTask = dayTasks.find((t) => t.kind === "participation");
    const homeworkTask = dayTasks.find((t) => t.kind === "homework");
    const recitationTask = dayTasks.find((t) => t.kind === "recitation");
    const examTask = dayTasks.find((t) => t.kind === "exam");

    const groupId = dayTasks[0]?.groupId ?? fallbackGroupId;

    let hasExam = false;
    let examTotal = "";
    let subject = "";
    let hasParticipation = true;
    let hasHomework = true;
    let hasRecitation = true;
    if (groupId) {
      const cacheKey = `${groupId}-${date}`;
      let session = sessionCache.get(cacheKey);
      if (session === undefined) {
        session = await db.sessions.where("[groupId+date]").equals([groupId, date]).first();
        sessionCache.set(cacheKey, session || null);
      }
      hasExam = session?.hasExam ?? false;
      examTotal = session?.examTotal ?? "";
      subject = session?.subject ?? "";
      hasParticipation = session?.hasParticipation ?? true;
      hasHomework = session?.hasHomework ?? true;
      hasRecitation = session?.hasRecitation ?? true;
    }

    const participation = {
      stars: participationTask?.stars ?? 0,
      isExcused: !!participationTask?.isExcused,
      recorded: !!participationTask,
    };
    const homework = {
      stars: homeworkTask?.stars ?? 0,
      isExcused: !!homeworkTask?.isExcused,
      recorded: !!homeworkTask,
    };
    const recitation = {
      stars: recitationTask?.stars ?? 0,
      isExcused: !!recitationTask?.isExcused,
      recorded: !!recitationTask,
    };
    const exam = {
      score: examTask?.score ?? "",
      total: examTotal,
      isExcused: !!examTask?.isExcused,
      recorded: !!examTask,
    };

    const { scoreOutOf10 } = computeSessionScore({
      points,
      hasExam,
      examTotal,
      hasParticipation,
      hasHomework,
      hasRecitation,
      attendance,
      participation,
      homework,
      recitation,
      exam,
    });

    results.push({
      date,
      groupId,
      attendance,
      subject,
      hasExam,
      participation,
      homework,
      recitation,
      exam,
      scoreOutOf10,
    });
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
