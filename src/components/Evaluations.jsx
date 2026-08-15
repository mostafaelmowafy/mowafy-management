// src/components/Evaluations.jsx
// شاشة التقييم اليومي للحصة
// - إعدادات النقاط (الأوزان) عامة وثابتة، تُخزَّن في localStorage ولا تُعرض هنا للتعديل.
// - إعدادات الحصة الحالية (هل يوجد امتحان؟) تخص كل (مجموعة + تاريخ) وتُخزَّن في db.sessions.
// - كل بند تقييم (تفاعل/واجب/امتحان) يُخزَّن كسجل منفصل في db.tasks مربوط بالطالب
//   والتاريخ ونوع البند (kind)، عبر الفهرس المركب [studentId+date+kind].

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, todayStr } from "../db/db";
import { getDefaultTemplate, fillTemplate, buildWhatsAppLink as buildWaLink } from "../lib/whatsappTemplates";
import { loadSubjects } from "../lib/subjects";
import { loadPointsSettings } from "../lib/points";
import { computeSessionScore } from "../lib/scoring";

// ----------------------------------------------------------------------
// دوال حفظ (Upsert) — تكتب في Dexie مباشرة عند أي تغيير من المدرس
// ----------------------------------------------------------------------
async function upsertAttendance(studentId, date, status) {
  const existing = await db.attendance
    .where("[studentId+date]")
    .equals([studentId, date])
    .first();
  if (existing) {
    await db.attendance.update(existing.id, { status });
  } else {
    await db.attendance.add({ studentId, date, status });
  }
}

async function upsertTask(studentId, groupId, date, kind, patch) {
  const existing = await db.tasks
    .where("[studentId+date+kind]")
    .equals([studentId, date, kind])
    .first();
  if (existing) {
    await db.tasks.update(existing.id, patch);
  } else {
    await db.tasks.add({ studentId, groupId, date, kind, ...patch });
  }
}

async function upsertSession(groupId, date, patch) {
  const existing = await db.sessions
    .where("[groupId+date]")
    .equals([groupId, date])
    .first();
  if (existing) {
    await db.sessions.update(existing.id, patch);
  } else {
    await db.sessions.add({ groupId, date, hasExam: false, examTotal: "", subject: "", ...patch });
  }
}

// نصوص عربية تُستخدم في الواجهة وفي رسالة الواتساب
const ATTENDANCE_LABEL = { Present: "حاضر", Absent: "غائب", Excused: "مستثنى" };

// تحويل عدد نجوم الواجب لوصف نصي في رسالة الواتساب (الواجهة نفسها تعرض النجوم كما هي)
function homeworkLabelFromStars(stars) {
  const s = Number(stars) || 0;
  if (s === 0) return "لم ينجز";
  if (s <= 2) return "أنجز بشكل ضعيف";
  if (s <= 3) return "أنجز بشكل جيد";
  return "أنجز بشكل كامل"; // (3, 5]
}

// تحويل عدد نجوم التفاعل لوصف نصي في رسالة الواتساب
function participationLabelFromStars(stars) {
  const s = Number(stars) || 0;
  if (s === 0) return "سيئ";
  if (s <= 1) return "ضعيف";
  if (s <= 2) return "جيد";
  if (s <= 3) return "جيد جداً";
  return "ممتاز"; // (3, 5]
}


// ========================================================================
export default function Evaluations({ onDone, initialGroupId }) {
  const points = useMemo(() => loadPointsSettings(), []);
  const subjects = useMemo(() => loadSubjects(), []); // فاضية = ميزة المواد غير مفعّلة

  const [groupId, setGroupId] = useState(initialGroupId ? String(initialGroupId) : "");
  const [date, setDate] = useState(todayStr());

  const activeGroups = useLiveQuery(
    () => db.groups.where("isArchived").equals(0).toArray(),
    [],
    []
  );

  // اختيار أول مجموعة نشطة تلقائياً عند توفرها لأول مرة (initialGroupId بالفعل
  // مضبوط كقيمة أولية عبر useState أعلاه — هنا فقط للحالة اللي معندهاش أي قيمة إطلاقاً)
  useEffect(() => {
    if (!groupId && activeGroups && activeGroups.length > 0) {
      setGroupId(String(activeGroups[0].id));
    }
  }, [activeGroups, groupId]);

  const numericGroupId = groupId ? Number(groupId) : null;

  const session = useLiveQuery(
    () =>
      numericGroupId
        ? db.sessions.where("[groupId+date]").equals([numericGroupId, date]).first()
        : Promise.resolve(null),
    [numericGroupId, date],
    null
  );

  const hasExam = session?.hasExam ?? false;
  const examTotal = session?.examTotal ?? "";
  // المادة الافتراضية لهذه الحصة (مجموعة+تاريخ) — قابلة للتغيير يومياً تماماً كالامتحان
  const subject = session?.subject ?? (subjects[0] || "");

  const students = useLiveQuery(
    () =>
      numericGroupId
        ? db.students
            .where("groupId")
            .equals(numericGroupId)
            .and((s) => !s.isArchived)
            .toArray()
        : Promise.resolve([]),
    [numericGroupId],
    []
  );

  const attendanceForDate = useLiveQuery(
    () => db.attendance.where("date").equals(date).toArray(),
    [date],
    []
  );

  const tasksForDate = useLiveQuery(
    () => db.tasks.where("date").equals(date).toArray(),
    [date],
    []
  );

  // خرائط سريعة: studentId -> السجل المطابق
  const attendanceMap = useMemo(() => {
    const map = new Map();
    (attendanceForDate || []).forEach((r) => map.set(r.studentId, r.status));
    return map;
  }, [attendanceForDate]);

  const tasksMap = useMemo(() => {
    const map = new Map(); // studentId -> { participation, homework, exam }
    (tasksForDate || []).forEach((t) => {
      if (!map.has(t.studentId)) {
        map.set(t.studentId, {
          participation: { stars: 0, isExcused: false },
          homework: { stars: 0, isExcused: false },
          exam: { score: "", isExcused: false },
        });
      }
      const entry = map.get(t.studentId);
      if (t.kind === "participation") entry.participation = { stars: t.stars ?? 0, isExcused: !!t.isExcused };
      if (t.kind === "homework") entry.homework = { stars: t.stars ?? 0, isExcused: !!t.isExcused };
      if (t.kind === "exam") entry.exam = { score: t.score ?? "", isExcused: !!t.isExcused };
    });
    return map;
  }, [tasksForDate]);

  function getStudentEval(studentId) {
    const attendance = attendanceMap.get(studentId) || "Absent";
    const defaults = {
      participation: { stars: 0, isExcused: false },
      homework: { stars: 0, isExcused: false },
      exam: { score: "", isExcused: false },
    };
    const t = tasksMap.get(studentId) || defaults;
    return { attendance, ...t };
  }

  const selectedGroup = (activeGroups || []).find((g) => g.id === numericGroupId);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* الرأس */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">تقييم الحصة</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              العودة
            </button>
          )}
        </header>

        {/* إعدادات الحصة الحالية */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">المجموعة</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="" disabled>
                  اختر مجموعة...
                </option>
                {(activeGroups || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.groupName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">التاريخ</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* اختيار المادة — يظهر فقط لو المدرس عرّف مواد من الإعدادات */}
            {subjects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">المادة</label>
                <select
                  value={subject}
                  onChange={(e) =>
                    numericGroupId && upsertSession(numericGroupId, date, { subject: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="text-sm font-medium text-slate-700">هل يوجد امتحان اليوم؟</span>
                <ToggleSwitch
                  checked={hasExam}
                  onChange={(checked) =>
                    numericGroupId &&
                    upsertSession(numericGroupId, date, {
                      hasExam: checked,
                      examTotal: checked ? examTotal || "" : "",
                    })
                  }
                  disabled={!numericGroupId}
                />
              </label>
            </div>

            {hasExam && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  الدرجة النهائية لورقة الامتحان
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="مثال: 30"
                  value={examTotal}
                  onChange={(e) =>
                    numericGroupId &&
                    upsertSession(numericGroupId, date, { hasExam: true, examTotal: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            مجموع نقاط الحصة: {points.attendance + points.participation + points.homework}
            {hasExam
              ? ` + ${points.exam} (امتحان) = ${points.attendance + points.participation + points.homework + points.exam}`
              : ""}
          </p>
        </div>

        {/* حالة عدم اختيار مجموعة / عدم وجود طلاب */}
        {!numericGroupId && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
            اختر مجموعة لعرض قائمة الطلاب.
          </p>
        )}

        {numericGroupId && students && students.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
            لا يوجد طلاب نشطون في هذه المجموعة.
          </p>
        )}

        {/* قائمة الطلاب */}
        {numericGroupId && students && students.length > 0 && (
          <div className="space-y-3">
            {students.map((student) => (
              <StudentEvalRow
                key={student.id}
                student={student}
                group={selectedGroup}
                date={date}
                points={points}
                hasExam={hasExam}
                examTotal={examTotal}
                subject={subject}
                evalData={getStudentEval(student.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// صف تقييم طالب واحد
// ========================================================================
function StudentEvalRow({ student, group, date, points, hasExam, examTotal, subject, evalData }) {
  const { attendance, participation, homework, exam } = evalData;

  const { scoreOutOf10 } = computeSessionScore({
    points,
    hasExam,
    examTotal,
    attendance,
    participation,
    homework,
    exam,
  });

  const scoreColor =
    scoreOutOf10 >= 8
      ? "text-emerald-600 bg-emerald-50"
      : scoreOutOf10 >= 5
      ? "text-amber-600 bg-amber-50"
      : "text-rose-600 bg-rose-50";

  const whatsappHref = student.parentPhone
    ? buildWhatsAppLink(student, group, {
        attendance,
        participation,
        homework,
        exam,
        hasExam,
        examTotal,
        subject,
        scoreOutOf10,
      })
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-slate-900">{student.name}</p>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor}`}>
          {scoreOutOf10} / 10
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* الحضور */}
        <FieldGroup label="الحضور">
          <select
            value={attendance}
            onChange={(e) => upsertAttendance(student.id, date, e.target.value)}
            className={selectClass}
          >
            <option value="Present">حاضر</option>
            <option value="Absent">غائب</option>
            <option value="Excused">مستثنى</option>
          </select>
        </FieldGroup>

        {/* التفاعل — نظام 5 نجوم */}
        <FieldGroup label="التفاعل">
          <div className="flex items-center gap-2">
            <StarRating
              value={participation.stars}
              disabled={participation.isExcused}
              onChange={(stars) =>
                upsertTask(student.id, student.groupId, date, "participation", {
                  stars,
                  isExcused: false,
                })
              }
            />
            <ExcusedCheckbox
              checked={participation.isExcused}
              onChange={(checked) =>
                upsertTask(student.id, student.groupId, date, "participation", {
                  stars: participation.stars,
                  isExcused: checked,
                })
              }
            />
          </div>
        </FieldGroup>

        {/* الواجب — نظام 5 نجوم */}
        <FieldGroup label="الواجب">
          <div className="flex items-center gap-2">
            <StarRating
              value={homework.stars}
              disabled={homework.isExcused}
              onChange={(stars) =>
                upsertTask(student.id, student.groupId, date, "homework", {
                  stars,
                  isExcused: false,
                })
              }
            />
            <ExcusedCheckbox
              checked={homework.isExcused}
              onChange={(checked) =>
                upsertTask(student.id, student.groupId, date, "homework", {
                  stars: homework.stars,
                  isExcused: checked,
                })
              }
            />
          </div>
        </FieldGroup>

        {/* الامتحان (يظهر فقط إذا كان مفعّلاً في هذه الحصة) */}
        {hasExam && (
          <FieldGroup label={`الامتحان (من ${examTotal || "؟"})`}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={examTotal || undefined}
                disabled={exam.isExcused}
                value={exam.score}
                onChange={(e) =>
                  upsertTask(student.id, student.groupId, date, "exam", {
                    score: e.target.value === "" ? "" : Number(e.target.value),
                    isExcused: false,
                  })
                }
                className={selectClass + " disabled:bg-slate-50 disabled:text-slate-400"}
                placeholder="الدرجة"
              />
              <ExcusedCheckbox
                checked={exam.isExcused}
                onChange={(checked) =>
                  upsertTask(student.id, student.groupId, date, "exam", {
                    score: exam.score,
                    isExcused: checked,
                  })
                }
              />
            </div>
          </FieldGroup>
        )}
      </div>

      {whatsappHref && (
        <div className="mt-3 flex justify-end">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <WhatsAppIcon />
            إرسال تقرير لولي الأمر
          </a>
        </div>
      )}
    </div>
  );
}

const selectClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

function FieldGroup({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function ExcusedCheckbox({ checked, onChange }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
      />
      مستثنى
    </label>
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
        checked ? "bg-indigo-600" : "bg-slate-300"
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

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.3 11.85-11.84 0-3.16-1.24-6.13-3.38-8.44Z" />
    </svg>
  );
}

// ========================================================================
// بناء رسالة الواتساب الديناميكية — تقرأ القالب "الافتراضي" لفئة "متابعة التقييم"
// من الإعدادات (localStorage) وتستبدل متغيراته بالبيانات الحقيقية
// ========================================================================
function buildWhatsAppLink(student, group, { attendance, participation, homework, exam, hasExam, examTotal, subject, scoreOutOf10 }) {
  const template = getDefaultTemplate("evaluation");
  if (!template) return null; // لا يوجد أي قالب في هذه الفئة (حالة نادرة)

  const attendanceLabel = ATTENDANCE_LABEL[attendance] || "غائب";

  const homeworkStarsLabel = homework.isExcused
    ? "مستثنى"
    : homeworkLabelFromStars(homework.stars);

  const participationStarsLabel = participation.isExcused
    ? "مستثنى"
    : participationLabelFromStars(participation.stars);

  const examScoreLabel = !hasExam
    ? "لا يوجد امتحان"
    : exam.isExcused
    ? "مستثنى"
    : exam.score !== "" && exam.score !== null
    ? `${exam.score}/${examTotal || "؟"}`
    : "لم يُسجَّل";

  const message = fillTemplate(template.body, {
    "[اسم_الطالب]": student.name,
    "[المجموعة]": group?.groupName || "",
    "[المادة]": subject || "غير محدد",
    "[حالة_الحضور]": attendanceLabel,
    "[نجوم_الواجب]": homeworkStarsLabel,
    "[نجوم_التفاعل]": participationStarsLabel,
    "[درجة_الامتحان]": examScoreLabel,
    "[الدرجة_النهائية_للامتحان]": hasExam ? String(examTotal || "") : "لا يوجد",
    "[التقييم_العام]": `${scoreOutOf10}/10`,
    "[اسم_الشهر]": "",
    "[المبلغ]": "",
  });

  return buildWaLink(student.parentPhone, message);
}

// ========================================================================
// نظام تقييم بالنجوم (من 5) — قابل للنقر، ويدعم النقر على نفس النجمة لإعادة الضبط
// ========================================================================
function StarRating({ value, onChange, disabled }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className={`flex items-center gap-0.5 ${disabled ? "opacity-40" : ""}`}>
      {stars.map((n) => {
        const filled = n <= Math.round(value || 0);
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`${n} نجوم`}
            onClick={() => onChange(value === n ? n - 1 : n)} // نقر نفس النجمة الأخيرة يُنقص نجمة واحدة (يسمح بالوصول لصفر)
            className="p-0.5 disabled:cursor-not-allowed"
          >
            <StarIcon filled={filled} />
          </button>
        );
      })}
    </div>
  );
}

function StarIcon({ filled }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "#f59e0b" : "none"}
      stroke={filled ? "#f59e0b" : "#cbd5e1"}
      strokeWidth="1.5"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
