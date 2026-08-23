// src/lib/whatsappTemplates.js
// إدارة قوالب رسائل الواتساب — تُخزَّن في localStorage كمصفوفة كائنات
// يستخدمها: Settings.jsx (للإدارة)، Payments.jsx وEvaluations.jsx (للقراءة والتعبئة)

const STORAGE_KEY = "cms_whatsapp_templates";

export const CATEGORIES = {
  payment_reminder: "تذكير بالدفع",
  payment_confirmation: "تأكيد الدفع",
  evaluation: "متابعة التقييم",
  cumulative_report: "تقرير تراكمي",
};

// كل المتغيرات الديناميكية المتاحة، تُعرض كأزرار (Chips) في محرر القالب
export const TEMPLATE_VARIABLES = [
  "[اسم_الطالب]",
  "[المجموعة]",
  "[المادة]",
  "[حالة_الحضور]",
  "[نجوم_الواجب]",
  "[نجوم_التسميع]",
  "[نجوم_التفاعل]",
  "[درجة_الامتحان]",
  "[الدرجة_النهائية_للامتحان]",
  "[التقييم_العام]",
  "[التقييم_التراكمي]",
  "[الفترة]",
  "[اسم_الشهر]",
  "[المبلغ]",
];

function defaultTemplates() {
  return [
    {
      id: "default-payment_reminder",
      category: "payment_reminder",
      name: "افتراضي",
      body:
        "🔔 تذكير بالمصروفات\n\n" +
        "الطالب/ة: [اسم_الطالب]\n" +
        "الشهر: [اسم_الشهر]\n\n" +
        "نأمل التكرم بتسديد المصروفات في أقرب وقت ممكن.\n\n" +
        "شكراً لتعاونكم 🌷",
      isDefault: true,
    },
    {
      id: "default-payment_confirmation",
      category: "payment_confirmation",
      name: "افتراضي",
      body:
        "✅ إيصال استلام مصروفات\n\n" +
        "الطالب/ة: [اسم_الطالب]\n" +
        "الشهر: [اسم_الشهر]\n" +
        "المبلغ المستلَم: [المبلغ] ج.م\n\n" +
        "تم السداد بنجاح، شكراً لكم 🌷",
      isDefault: true,
    },
    {
      id: "default-evaluation",
      category: "evaluation",
      name: "افتراضي",
      body:
        "📋 تقرير أداء الحصة\n\n" +
        "الطالب/ة: [اسم_الطالب]\n" +
        "المجموعة: [المجموعة]\n" +
        "المادة: [المادة]\n" +
        "━━━━━━━━━━\n" +
        "الحضور: [حالة_الحضور]\n" +
        "الواجب: [نجوم_الواجب]\n" +
        "التسميع: [نجوم_التسميع]\n" +
        "التفاعل: [نجوم_التفاعل]\n" +
        "━━━━━━━━━━\n\n" +
        "🎯 التقييم العام: [التقييم_العام]/10",
      isDefault: true,
    },
    {
      id: "default-cumulative_report",
      category: "cumulative_report",
      name: "افتراضي",
      body:
        "📊 تقرير التقييم التراكمي\n\n" +
        "الطالب/ة: [اسم_الطالب]\n" +
        "المجموعة: [المجموعة]\n" +
        "الفترة: [الفترة]\n\n" +
        "🎯 المتوسط التراكمي: [التقييم_التراكمي]/10",
      isDefault: true,
    },
  ];
}

// ----------------------------------------------------------------------
// قراءة/كتابة كل القوالب
// ----------------------------------------------------------------------
export function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = defaultTemplates();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    let templates = JSON.parse(raw);
    if (!Array.isArray(templates) || templates.length === 0) {
      templates = defaultTemplates();
      saveTemplates(templates);
      return templates;
    }

    // ترقية تلقائية: لو ظهرت فئة جديدة في نسخة أحدث من التطبيق (زي "تقرير تراكمي")
    // ومش موجودة أصلاً في القوالب المحفوظة سابقاً، نضيف قالبها الافتراضي بدون
    // المساس بأي قالب موجود بالفعل أو بتخصيصات المدرس السابقة
    const existingCategories = new Set(templates.map((t) => t.category));
    const missingDefaults = defaultTemplates().filter((t) => !existingCategories.has(t.category));
    if (missingDefaults.length > 0) {
      templates = [...templates, ...missingDefaults];
    }

    // ترقية مستهدَفة إضافية: إضافة سطر "التسميع" (ميزة جديدة) للقالب الافتراضي
    // الأصلي لفئة "متابعة التقييم" تحديداً (id === "default-evaluation") فقط —
    // أي قالب اتعمله المدرس بنفسه أو غيّر اسمه له id مختلف، فمش بنلمسه إطلاقاً
    let migratedBody = false;
    templates = templates.map((t) => {
      if (t.id === "default-evaluation" && !t.body.includes("[نجوم_التسميع]")) {
        migratedBody = true;
        const recitationLine = "- التسميع: [نجوم_التسميع]";
        const newBody = t.body.includes("- الواجب:")
          ? t.body.replace(/(- الواجب:[^\n]*)/, `$1\n${recitationLine}`)
          : `${t.body}\n${recitationLine}`;
        return { ...t, body: newBody };
      }
      return t;
    });

    if (missingDefaults.length > 0 || migratedBody) {
      saveTemplates(templates);
    }

    return templates;
  } catch {
    return defaultTemplates();
  }
}

function saveTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/** القالب "الافتراضي" الحالي لفئة معيّنة (أو أول قالب متاح إن لم يوجد افتراضي محدد) */
export function getDefaultTemplate(category) {
  const templates = loadTemplates();
  const inCategory = templates.filter((t) => t.category === category);
  return inCategory.find((t) => t.isDefault) || inCategory[0] || null;
}

// ----------------------------------------------------------------------
// إدارة القوالب (تُستخدم من شاشة الإعدادات)
// ----------------------------------------------------------------------
export function addTemplate(category, name, body) {
  const templates = loadTemplates();
  const isFirstInCategory = !templates.some((t) => t.category === category);
  const newTemplate = {
    id: `tpl-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    category,
    name: name.trim() || "قالب بدون اسم",
    body,
    isDefault: isFirstInCategory, // أول قالب في الفئة يصبح افتراضياً تلقائياً
  };
  templates.push(newTemplate);
  saveTemplates(templates);
  return newTemplate;
}

export function updateTemplate(id, patch) {
  const templates = loadTemplates().map((t) => (t.id === id ? { ...t, ...patch } : t));
  saveTemplates(templates);
}

export function deleteTemplate(id) {
  let templates = loadTemplates();
  const target = templates.find((t) => t.id === id);
  if (!target) return;

  templates = templates.filter((t) => t.id !== id);

  // إن حذفنا القالب الافتراضي، رقّي أول قالب متبقٍ في نفس الفئة ليصبح الافتراضي الجديد
  if (target.isDefault) {
    const nextInCategory = templates.find((t) => t.category === target.category);
    if (nextInCategory) nextInCategory.isDefault = true;
  }

  saveTemplates(templates);
}

export function setDefaultTemplate(category, id) {
  const templates = loadTemplates().map((t) =>
    t.category === category ? { ...t, isDefault: t.id === id } : t
  );
  saveTemplates(templates);
}

// ----------------------------------------------------------------------
// تعبئة القالب بالمتغيرات الحقيقية
// ----------------------------------------------------------------------
/** يستبدل كل متغير [مثل_هذا] الموجود في نص القالب بقيمته الحقيقية من vars */
export function fillTemplate(body, vars) {
  let result = body;
  Object.entries(vars).forEach(([key, value]) => {
    result = result.split(key).join(value ?? "");
  });
  return result;
}

/** يبني رابط wa.me جاهزاً من قالب مُعبَّأ ورقم هاتف */
export function buildWhatsAppLink(phone, message) {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
