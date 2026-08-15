// src/lib/merge.js
// دمج البيانات (Merge) — يضيف بيانات من ملف نسخة احتياطية للبيانات الموجودة
// حالياً على الجهاز، بدون حذف أي شيء. مختلف تماماً عن "استيراد نسخة احتياطية"
// في db.js (اللي بيفرّغ كل الجداول ويستبدلها بالكامل).
//
// التحدي الأساسي: كل جهاز يولّد أرقام id تلقائية (auto-increment) مستقلة تماماً،
// فمن المحتمل جداً أن يكون عندك "مجموعة id=1" على جهازك وعنده "طالب آخر id=1"
// على الجهاز التاني. لو دمجنا الأرقام زي ما هي، هنكسر البيانات. الحل: نطابق كل
// سجل بمفتاح طبيعي (Natural Key) — قد يكون موجوداً بالفعل (نتجاهله ونربط الأرقام)
// أو جديداً (نضيفه برقم id جديد تماماً على هذا الجهاز، ونحدّث كل ما يشير إليه).

import { db } from "../db/db";

export async function mergeImportedData(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("ملف غير صالح");
  }

  const stats = { groups: 0, students: 0, attendance: 0, tasks: 0, payments: 0, sessions: 0 };

  await db.transaction(
    "rw",
    db.groups,
    db.students,
    db.attendance,
    db.tasks,
    db.payments,
    db.sessions,
    async () => {
      // ------------------------------------------------------------
      // المجموعات — المفتاح الطبيعي: اسم المجموعة + السنة الدراسية
      // ------------------------------------------------------------
      const existingGroups = await db.groups.toArray();
      const groupIdMap = new Map(); // id في الملف المستورَد -> id الحقيقي على هذا الجهاز

      for (const g of payload.groups || []) {
        const match = existingGroups.find(
          (eg) => eg.groupName === g.groupName && eg.academicYear === g.academicYear
        );
        if (match) {
          groupIdMap.set(g.id, match.id);
        } else {
          const { id: sourceId, ...rest } = g;
          const newId = await db.groups.add(rest);
          groupIdMap.set(sourceId, newId);
          existingGroups.push({ ...rest, id: newId });
          stats.groups++;
        }
      }

      // ------------------------------------------------------------
      // الطلاب — المفتاح الطبيعي: qrCode (فريد لكل طالب أصلاً بالتصميم)
      // ------------------------------------------------------------
      const existingStudents = await db.students.toArray();
      const studentIdMap = new Map();

      for (const s of payload.students || []) {
        const match = existingStudents.find((es) => es.qrCode === s.qrCode);
        if (match) {
          studentIdMap.set(s.id, match.id);
        } else {
          const { id: sourceId, ...rest } = s;
          rest.groupId = groupIdMap.get(s.groupId) ?? rest.groupId;
          const newId = await db.students.add(rest);
          studentIdMap.set(sourceId, newId);
          existingStudents.push({ ...rest, id: newId });
          stats.students++;
        }
      }

      // ------------------------------------------------------------
      // الحضور — المفتاح الطبيعي: [studentId المُطابَق + date]
      // ------------------------------------------------------------
      for (const a of payload.attendance || []) {
        const mappedStudentId = studentIdMap.get(a.studentId);
        if (!mappedStudentId) continue; // طالب مش موجود في الملف أصلاً (نادر جداً)
        const exists = await db.attendance
          .where("[studentId+date]")
          .equals([mappedStudentId, a.date])
          .first();
        if (!exists) {
          await db.attendance.add({ studentId: mappedStudentId, date: a.date, status: a.status });
          stats.attendance++;
        }
      }

      // ------------------------------------------------------------
      // بنود التقييم — المفتاح الطبيعي: [studentId المُطابَق + date + kind]
      // ------------------------------------------------------------
      for (const t of payload.tasks || []) {
        const mappedStudentId = studentIdMap.get(t.studentId);
        if (!mappedStudentId) continue;
        const mappedGroupId = groupIdMap.get(t.groupId) ?? t.groupId;
        const exists = await db.tasks
          .where("[studentId+date+kind]")
          .equals([mappedStudentId, t.date, t.kind])
          .first();
        if (!exists) {
          const { id, studentId, groupId, ...rest } = t;
          await db.tasks.add({ studentId: mappedStudentId, groupId: mappedGroupId, ...rest });
          stats.tasks++;
        }
      }

      // ------------------------------------------------------------
      // المدفوعات — المفتاح الطبيعي: [studentId المُطابَق + month]
      // ------------------------------------------------------------
      for (const p of payload.payments || []) {
        const mappedStudentId = studentIdMap.get(p.studentId);
        if (!mappedStudentId) continue;
        const exists = await db.payments
          .where("[studentId+month]")
          .equals([mappedStudentId, p.month])
          .first();
        if (!exists) {
          const { id, studentId, ...rest } = p;
          await db.payments.add({ studentId: mappedStudentId, ...rest });
          stats.payments++;
        }
      }

      // ------------------------------------------------------------
      // إعدادات الحصص — المفتاح الطبيعي: [groupId المُطابَق + date]
      // ------------------------------------------------------------
      for (const s of payload.sessions || []) {
        const mappedGroupId = groupIdMap.get(s.groupId) ?? s.groupId;
        const exists = await db.sessions
          .where("[groupId+date]")
          .equals([mappedGroupId, s.date])
          .first();
        if (!exists) {
          const { id, groupId, ...rest } = s;
          await db.sessions.add({ groupId: mappedGroupId, ...rest });
          stats.sessions++;
        }
      }
    }
  );

  return stats;
}
