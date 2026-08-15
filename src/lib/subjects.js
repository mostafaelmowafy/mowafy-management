// src/lib/subjects.js
// قائمة المواد الدراسية (اختيارية) — مفيدة للمدرّس اللي بيدرّس أكتر من مادة
// (تفسير/فقه/حديث مثلاً). لو القائمة فاضية، ميزة اختيار المادة تختفي تلقائياً
// من شاشة التقييم لأنها مش محتاجاها.

const SUBJECTS_KEY = "cms_subjects";

export function loadSubjects() {
  try {
    const raw = localStorage.getItem(SUBJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSubjects(list) {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(list));
}

export function addSubject(name) {
  const trimmed = name.trim();
  if (!trimmed) return loadSubjects();
  const list = loadSubjects();
  if (list.includes(trimmed)) return list; // تفادي التكرار
  const next = [...list, trimmed];
  saveSubjects(next);
  return next;
}

export function deleteSubject(name) {
  const next = loadSubjects().filter((s) => s !== name);
  saveSubjects(next);
  return next;
}
