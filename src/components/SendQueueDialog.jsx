// src/components/SendQueueDialog.jsx
// نافذة الإرسال المتسلسل — واتساب لا يدعم إرسال لأكتر من رقم في ضغطة واحدة
// (قيد من واتساب نفسه، مش من التطبيق)، فهذه أفضل بديل عملي: نفتح شات كل شخص
// جاهزاً بالرسالة، وبعد ما ترسله يدوياً تضغط "التالي" للشخص اللي بعده تلقائياً.
// items: [{ id, name, link }] — الروابط جاهزة مسبَقاً من الشاشة المستدعية.

import React, { useState } from "react";

export default function SendQueueDialog({ items, onClose }) {
  const [index, setIndex] = useState(0);
  const current = items[index];
  const isLast = index === items.length - 1;

  function handleAdvance() {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-xs font-medium text-stone-400">
          {index + 1} من {items.length}
        </p>
        <h3 className="mb-4 text-lg font-bold text-stone-900">{current.name}</h3>

        <a
          href={current.link}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <WhatsAppIcon />
          فتح واتساب لهذا الشخص
        </a>

        <div className="flex gap-3">
          <button
            onClick={handleAdvance}
            className="flex-1 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900"
          >
            {isLast ? "إنهاء" : "التالي"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            إيقاف
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.86 11.86 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.3 11.85-11.84 0-3.16-1.24-6.13-3.38-8.44Z" />
    </svg>
  );
}
