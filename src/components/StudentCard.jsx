// src/components/StudentCard.jsx
// كارنيه الطالب (QR) كمكوّن مشترك قابل لإعادة الاستخدام — تصميم الكارنيه ومنطق
// الطباعة/الحفظ كصورة في مكان واحد بدل تكراره، لأنه الآن مُستخدَم من مكانين:
// 1) شاشة إضافة طالب (بعد الحفظ مباشرة)
// 2) شاشة "طلاب المجموعة" (زر "الكارنيه" لأي طالب موجود بالفعل، في أي وقت)

import React, { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function StudentCard({ student, groupName }) {
  const canvasRef = useRef(null);

  function handleSaveAsImage() {
    const sourceCanvas = canvasRef.current?.querySelector("canvas");
    if (!sourceCanvas) return;

    // نرسم الكارنيه كاملاً (اسم + مجموعة + QR) على canvas مؤقت لتصديره كصورة واحدة
    const width = 420;
    const height = 560;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e7d0c0";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    ctx.fillStyle = "#783f14";
    ctx.fillRect(0, 0, width, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Tahoma, Arial";
    ctx.textAlign = "center";
    ctx.fillText("كارنيه الطالب", width / 2, 44);

    const qrSize = 240;
    ctx.drawImage(sourceCanvas, (width - qrSize) / 2, 100, qrSize, qrSize);

    ctx.fillStyle = "#1c1411";
    ctx.font = "bold 20px Tahoma, Arial";
    ctx.fillText(student.name, width / 2, 380);

    ctx.fillStyle = "#78614f";
    ctx.font = "16px Tahoma, Arial";
    ctx.fillText(groupName || "—", width / 2, 410);

    ctx.fillStyle = "#a88c74";
    ctx.font = "12px Tahoma, Arial";
    ctx.fillText(student.qrCode, width / 2, 440);

    const link = document.createElement("a");
    link.download = `card-${student.name}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div>
      {/* أنماط خاصة بالطباعة: تُظهر الكارنيه فقط وتُخفي كل شيء آخر */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-card, #printable-card * { visibility: visible; }
          #printable-card {
            position: fixed;
            top: 0; left: 0; right: 0;
            margin: 40px auto;
          }
        }
      `}</style>

      <div
        id="printable-card"
        className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      >
        <div className="bg-amber-800 py-3 text-center text-sm font-bold text-white">
          كارنيه الطالب
        </div>
        <div ref={canvasRef} className="flex justify-center bg-white py-6">
          <QRCodeCanvas value={student.qrCode} size={200} level="M" includeMargin />
        </div>
        <div className="border-t border-stone-200 px-4 pb-5 pt-3 text-center">
          <p className="text-lg font-bold text-stone-900">{student.name}</p>
          <p className="text-sm text-stone-500">{groupName || "—"}</p>
          <p className="mt-1 font-mono text-[11px] text-stone-400">{student.qrCode}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={handlePrint}
          className="rounded-xl bg-amber-800 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-900"
        >
          طباعة الكارنيه
        </button>
        <button
          onClick={handleSaveAsImage}
          className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          حفظ كصورة
        </button>
      </div>
    </div>
  );
}
