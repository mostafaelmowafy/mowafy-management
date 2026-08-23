// src/components/Evaluations.jsx
// شاشة التقييم اليومي للحصة
// - إعدادات النقاط (الأوزان) عامة وثابتة، تُخزَّن في localStorage ولا تُعرض هنا للتعديل.
// - إعدادات الحصة الحالية (امتحان/واجب/تسميع/تفاعل مفعّلين؟) تخص كل (مجموعة + تاريخ)
//   وتُخزَّن في db.sessions — كلها قابلة للتفعيل/التعطيل يومياً بنفس الطريقة.
// - كل بند تقييم (تفاعل/واجب/تسميع/امتحان) يُخزَّن كسجل منفصل في db.tasks مربوط
//   بالطالب والتاريخ ونوع البند (kind)، عبر الفهرس المركب [studentId+date+kind].

import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, todayStr } from "../db/db";
import { getDefaultTemplate, fillTemplate, buildWhatsAppLink as buildWaLink } from "../lib/whatsappTemplates";
import { loadSubjects } from "../lib/subjects";
import { loadPointsSettings } from "../lib/points";
import { computeSessionScore } from "../lib/scoring";
import SendQueueDialog from "./SendQueueDialog";

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
    await db.sessions.add({
      groupId,
      date,
      hasExam: false,
      examTotal: "",
      subject: "",
      hasParticipation: true,
      hasHomework: true,
      hasRecitation: true,
      ...patch,
    });
  }
}

// نصوص عربية تُستخدم في الواجهة وفي رسالة الواتساب
const ATTENDANCE_LABEL = { Present: "حاضر", Absent: "غائب", Excused: "حضر متأخر" };

// تحويل عدد نجوم الواجب لوصف نصي في رسالة الواتساب (الواجهة نفسها تعرض النجوم كما هي)
function homeworkLabelFromStars(stars) {
  const s = Number(stars) || 0;
  if (s === 0) return "لم ينجز";
  if (s <= 2) return "أنجز بشكل ضعيف";
  if (s <= 3) return "أنجز بشكل جيد";
  return "أنجز بشكل كامل"; // (3, 5]
}

// تحويل عدد نجوم التسميع لوصف نصي في رسالة الواتساب (نفس منطق الواجب)
function recitationLabelFromStars(stars) {
  const s = Number(stars) || 0;
  if (s === 0) return "لم يسمّع";
  if (s <= 2) return "سمّع بشكل ضعيف";
  if (s <= 3) return "سمّع بشكل جيد";
  return "سمّع بشكل كامل"; // (3, 5]
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

  useEffect(() => {
    if (!groupId && activeGroups && activeGroups.length > 0) {
      setGroupId(String(activeGroups[0].id));
    }
  }, [activeGroups, groupId]);

  const numericGroupId = groupId ? Number(groupId) : null;

  // تحديد متعدد للطلاب — لتنفيذ نفس الإجراء (حضور/واجب/تسميع/تفاعل) دفعة واحدة
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendQueue, setSendQueue] = useState(null); // مصفوفة [{id,name,link}] أثناء الإرسال المتسلسل الجماعي
  useEffect(() => {
    setSelectedIds(new Set()); // نفضّي التحديد عند تغيير المجموعة أو التاريخ تفادياً لتطبيق إجراء بالخطأ
  }, [numericGroupId, date]);

  function toggleSelect(studentId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleSelectAll(allIds) {
    setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }

  async function bulkSetAttendance(status) {
    await Promise.all(Array.from(selectedIds).map((id) => upsertAttendance(id, date, status)));
  }

  async function bulkSetTask(kind, stars) {
    await Promise.all(
      Array.from(selectedIds).map((id) => {
        const student = (students || []).find((s) => s.id === id);
        if (!student) return Promise.resolve();
        return upsertTask(id, student.groupId, date, kind, { stars, isExcused: false });
      })
    );
  }

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
  const subject = session?.subject ?? (subjects[0] || "");
  // البنود الثلاثة دي مفعّلة افتراضياً (زي السلوك القديم) إلا لو المدرس عطّلها يدوياً لهذا اليوم
  const hasParticipation = session?.hasParticipation ?? true;
  const hasHomework = session?.hasHomework ?? true;
  const hasRecitation = session?.hasRecitation ?? true;

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

  const attendanceMap = useMemo(() => {
    const map = new Map();
    (attendanceForDate || []).forEach((r) => map.set(r.studentId, r.status));
    return map;
  }, [attendanceForDate]);

  const emptyField = { stars: 0, isExcused: false };
  const emptyExam = { score: "", isExcused: false };
  const emptyNote = { text: "" };

  const tasksMap = useMemo(() => {
    const map = new Map(); // studentId -> { participation, homework, recitation, exam, note }
    (tasksForDate || []).forEach((t) => {
      if (!map.has(t.studentId)) {
        map.set(t.studentId, {
          participation: { ...emptyField },
          homework: { ...emptyField },
          recitation: { ...emptyField },
          exam: { ...emptyExam },
          note: { ...emptyNote },
        });
      }
      const entry = map.get(t.studentId);
      if (t.kind === "participation") entry.participation = { stars: t.stars ?? 0, isExcused: !!t.isExcused };
      if (t.kind === "homework") entry.homework = { stars: t.stars ?? 0, isExcused: !!t.isExcused };
      if (t.kind === "recitation") entry.recitation = { stars: t.stars ?? 0, isExcused: !!t.isExcused };
      if (t.kind === "exam") entry.exam = { score: t.score ?? "", isExcused: !!t.isExcused };
      if (t.kind === "note") entry.note = { text: t.text || "" };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksForDate]);

  function getStudentEval(studentId) {
    const attendance = attendanceMap.get(studentId) || "Absent";
    const defaults = {
      participation: { ...emptyField },
      homework: { ...emptyField },
      recitation: { ...emptyField },
      exam: { ...emptyExam },
      note: { ...emptyNote },
    };
    const t = tasksMap.get(studentId) || defaults;
    return { attendance, ...t };
  }

  const selectedGroup = (activeGroups || []).find((g) => g.id === numericGroupId);

  function handleBulkSendReports() {
    const items = [];
    Array.from(selectedIds).forEach((id) => {
      const student = (students || []).find((s) => s.id === id);
      if (!student || !student.parentPhone) return;
      const evalData = getStudentEval(id);
      const { scoreOutOf10 } = computeSessionScore({
        points,
        hasExam,
        examTotal,
        hasParticipation,
        hasHomework,
        hasRecitation,
        attendance: evalData.attendance,
        participation: evalData.participation,
        homework: evalData.homework,
        recitation: evalData.recitation,
        exam: evalData.exam,
      });
      const link = buildWhatsAppLink(student, selectedGroup, {
        attendance: evalData.attendance,
        participation: evalData.participation,
        homework: evalData.homework,
        recitation: evalData.recitation,
        exam: evalData.exam,
        hasExam,
        examTotal,
        subject,
        note: evalData.note,
        scoreOutOf10,
      });
      if (link) items.push({ id, name: student.name, link });
    });
    if (items.length > 0) setSendQueue(items);
  }


  const availablePoints =
    points.attendance +
    (hasParticipation ? points.participation : 0) +
    (hasHomework ? points.homework : 0) +
    (hasRecitation ? points.recitation : 0) +
    (hasExam ? points.exam : 0);

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* الرأس */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-900">تقييم الحصة</h1>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              العودة
            </button>
          )}
        </header>

        {/* إعدادات الحصة الحالية */}
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-900">المجموعة</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
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
              <label className="mb-1.5 block text-sm font-medium text-stone-900">التاريخ</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
              />
            </div>

            {subjects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-900">المادة</label>
                <select
                  value={subject}
                  onChange={(e) =>
                    numericGroupId && upsertSession(numericGroupId, date, { subject: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
                >
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hasExam && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-900">
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
                  className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            )}
          </div>

          {/* مفاتيح تفعيل/تعطيل بنود الحصة — كلها قابلة للتغيير يومياً بنفس منطق الامتحان */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SessionToggle
              label="يوجد امتحان؟"
              checked={hasExam}
              disabled={!numericGroupId}
              onChange={(checked) =>
                numericGroupId &&
                upsertSession(numericGroupId, date, {
                  hasExam: checked,
                  examTotal: checked ? examTotal || "" : "",
                })
              }
            />
            <SessionToggle
              label="يوجد واجب؟"
              checked={hasHomework}
              disabled={!numericGroupId}
              onChange={(checked) =>
                numericGroupId && upsertSession(numericGroupId, date, { hasHomework: checked })
              }
            />
            <SessionToggle
              label="يوجد تسميع؟"
              checked={hasRecitation}
              disabled={!numericGroupId}
              onChange={(checked) =>
                numericGroupId && upsertSession(numericGroupId, date, { hasRecitation: checked })
              }
            />
            <SessionToggle
              label="يوجد تفاعل؟"
              checked={hasParticipation}
              disabled={!numericGroupId}
              onChange={(checked) =>
                numericGroupId && upsertSession(numericGroupId, date, { hasParticipation: checked })
              }
            />
          </div>

          <p className="mt-3 text-xs text-stone-400">مجموع نقاط الحصة: {availablePoints}</p>
        </div>

        {!numericGroupId && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            اختر مجموعة لعرض قائمة الطلاب.
          </p>
        )}

        {numericGroupId && students && students.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
            لا يوجد طلاب نشطون في هذه المجموعة.
          </p>
        )}

        {numericGroupId && students && students.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={selectedIds.size === students.length && students.length > 0}
                  onChange={() => toggleSelectAll(students.map((s) => s.id))}
                  className="h-4 w-4 rounded border-stone-200 text-amber-800 focus:ring-amber-200"
                />
                تحديد الكل
              </label>
              {selectedIds.size > 0 && (
                <span className="text-xs text-stone-400">{selectedIds.size} طالب محدَّد</span>
              )}
            </div>

            {students.map((student) => (
              <StudentEvalRow
                key={student.id}
                student={student}
                group={selectedGroup}
                date={date}
                points={points}
                hasExam={hasExam}
                examTotal={examTotal}
                hasParticipation={hasParticipation}
                hasHomework={hasHomework}
                hasRecitation={hasRecitation}
                subject={subject}
                evalData={getStudentEval(student.id)}
                selected={selectedIds.has(student.id)}
                onToggleSelect={() => toggleSelect(student.id)}
              />
            ))}
          </div>
        )}

        {/* شريط الإجراءات الجماعية — يظهر فقط عند تحديد طالب واحد على الأقل */}
        {selectedIds.size > 0 && (
          <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-3xl px-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-lg">
              <span className="ml-1 text-xs font-semibold text-amber-900">
                إجراء جماعي لـ {selectedIds.size}:
              </span>

              <BulkButton label="تعليم حاضر" onClick={() => bulkSetAttendance("Present")} />
              <BulkButton label="تعليم غائب" onClick={() => bulkSetAttendance("Absent")} />
              <BulkButton label="تعليم حضر متأخر" onClick={() => bulkSetAttendance("Excused")} />

              {hasHomework && (
                <>
                  <BulkButton label="الكل: واجب كامل" onClick={() => bulkSetTask("homework", 5)} />
                  <BulkButton label="الكل: لم ينجز الواجب" onClick={() => bulkSetTask("homework", 0)} />
                </>
              )}
              {hasRecitation && (
                <>
                  <BulkButton label="الكل: تسميع كامل" onClick={() => bulkSetTask("recitation", 5)} />
                </>
              )}
              {hasParticipation && (
                <BulkButton label="الكل: تفاعل ممتاز" onClick={() => bulkSetTask("participation", 5)} />
              )}

              <BulkButton label="📩 إرسال تقارير للمحددين" onClick={handleBulkSendReports} />

              <button
                onClick={() => setSelectedIds(new Set())}
                className="mr-auto rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}

        {sendQueue && <SendQueueDialog items={sendQueue} onClose={() => setSendQueue(null)} />}
      </div>
    </div>
  );
}

// ========================================================================
// صف تقييم طالب واحد
// ========================================================================
function StudentEvalRow({
  student,
  group,
  date,
  points,
  hasExam,
  examTotal,
  hasParticipation,
  hasHomework,
  hasRecitation,
  subject,
  evalData,
  selected,
  onToggleSelect,
}) {
  const { attendance, participation, homework, recitation, exam, note } = evalData;

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
        recitation,
        exam,
        hasExam,
        examTotal,
        subject,
        note,
        scoreOutOf10,
      })
    : null;

  const visibleFieldsCount = 1 + (hasParticipation ? 1 : 0) + (hasHomework ? 1 : 0) + (hasRecitation ? 1 : 0) + (hasExam ? 1 : 0);
  const gridColsClass = visibleFieldsCount >= 4 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-3";

  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        selected ? "border-amber-800 bg-amber-50" : "border-stone-200 bg-white"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="h-4 w-4 shrink-0 rounded border-stone-200 text-amber-800 focus:ring-amber-200"
          />
          <span className="truncate font-semibold text-stone-900">{student.name}</span>
        </label>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${scoreColor}`}>
          {scoreOutOf10} / 10
        </span>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${gridColsClass}`}>
        {/* الحضور — أزرار مجاورة بدل قائمة منسدلة */}
        <FieldGroup label="الحضور">
          <AttendanceSegmented
            value={attendance}
            onChange={(status) => upsertAttendance(student.id, date, status)}
          />
        </FieldGroup>

        {hasParticipation && (
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
        )}

        {hasHomework && (
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
        )}

        {hasRecitation && (
          <FieldGroup label="التسميع">
            <div className="flex items-center gap-2">
              <StarRating
                value={recitation.stars}
                disabled={recitation.isExcused}
                onChange={(stars) =>
                  upsertTask(student.id, student.groupId, date, "recitation", {
                    stars,
                    isExcused: false,
                  })
                }
              />
              <ExcusedCheckbox
                checked={recitation.isExcused}
                onChange={(checked) =>
                  upsertTask(student.id, student.groupId, date, "recitation", {
                    stars: recitation.stars,
                    isExcused: checked,
                  })
                }
              />
            </div>
          </FieldGroup>
        )}

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
                className={selectClass + " disabled:bg-stone-50 disabled:text-stone-400"}
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

      {/* ملاحظة حرة عن الطالب لهذه الحصة — اختيارية، ولو فاضية بتتجاهل تماماً من رسالة الواتساب */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-stone-500">ملاحظة (اختياري)</label>
        <input
          type="text"
          value={note.text}
          onChange={(e) =>
            upsertTask(student.id, student.groupId, date, "note", { text: e.target.value })
          }
          placeholder="مثلاً: نسي الكتاب المدرسي..."
          className={selectClass}
        />
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
  "w-full rounded-lg border border-stone-200 px-2.5 py-2 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100";

function FieldGroup({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">{label}</label>
      {children}
    </div>
  );
}

// أزرار الحضور المتجاورة (بدل القائمة المنسدلة) — أوضح وأسرع بالضغط بإصبع واحد
function AttendanceSegmented({ value, onChange }) {
  const options = [
    { key: "Present", label: "حاضر", activeClass: "bg-emerald-600 text-white border-emerald-600" },
    { key: "Absent", label: "غائب", activeClass: "bg-rose-600 text-white border-rose-600" },
    { key: "Excused", label: "حضر متأخر", activeClass: "bg-amber-600 text-white border-amber-600" },
  ];
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
            value === opt.key ? opt.activeClass : "border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ExcusedCheckbox({ checked, onChange }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-stone-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-stone-200 text-amber-800 focus:ring-amber-200"
      />
      مستثنى
    </label>
  );
}

function SessionToggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
      <span className="text-xs font-medium text-stone-900">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
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

function BulkButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
    >
      {label}
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
function buildWhatsAppLink(
  student,
  group,
  { attendance, participation, homework, recitation, exam, hasExam, examTotal, subject, note, scoreOutOf10 },
  phone = student.parentPhone
) {
  const template = getDefaultTemplate("evaluation");
  if (!template) return null;

  const attendanceLabel = ATTENDANCE_LABEL[attendance] || "غائب";

  const homeworkStarsLabel = homework.isExcused ? "مستثنى" : homeworkLabelFromStars(homework.stars);
  const recitationStarsLabel = recitation.isExcused ? "مستثنى" : recitationLabelFromStars(recitation.stars);
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

  let message = fillTemplate(template.body, {
    "[اسم_الطالب]": student.name,
    "[المجموعة]": group?.groupName || "",
    "[المادة]": subject || "غير محدد",
    "[حالة_الحضور]": attendanceLabel,
    "[نجوم_الواجب]": homeworkStarsLabel,
    "[نجوم_التسميع]": recitationStarsLabel,
    "[نجوم_التفاعل]": participationStarsLabel,
    "[درجة_الامتحان]": examScoreLabel,
    "[الدرجة_النهائية_للامتحان]": hasExam ? String(examTotal || "") : "لا يوجد",
    "[التقييم_العام]": `${scoreOutOf10}/10`,
    "[اسم_الشهر]": "",
    "[المبلغ]": "",
    "[الفترة]": "",
    "[التقييم_التراكمي]": "",
  });

  // الملاحظة تُضاف فقط لو مكتوبة فعلاً — لو فاضية، تُتجاهَل تماماً من الرسالة
  // (لهذا مش جزء من نظام متغيرات القالب العادي؛ إضافتها كسطر ثابت في القالب كانت
  // هتسيب سطر فاضٍ دايماً لما ما فيش ملاحظة)
  if (note?.text?.trim()) {
    message += `\n📝 ملاحظة: ${note.text.trim()}`;
  }

  return buildWaLink(phone, message);
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
            onClick={() => onChange(value === n ? n - 1 : n)}
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
