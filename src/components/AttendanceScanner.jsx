// src/components/AttendanceScanner.jsx
// شاشة تسجيل الحضور عبر مسح QR الخاص بالطالب
// المكتبة: html5-qrcode (تتعامل مباشرة مع كاميرا الجهاز عبر المتصفح)

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { db, todayStr } from "../db/db";

const READER_ELEMENT_ID = "attendance-qr-reader";
const SCAN_COOLDOWN_MS = 1000; // مدة إيقاف المسح بعد كل عملية ناجحة/مكررة

export default function AttendanceScanner({ onDone }) {
  const html5QrCodeRef = useRef(null);
  const isProcessingRef = useRef(false); // يمنع معالجة أكثر من مسح في نفس اللحظة

  const [cameraState, setCameraState] = useState("initializing"); // initializing | running | denied | error
  const [cameraErrorDetail, setCameraErrorDetail] = useState("");
  const [toasts, setToasts] = useState([]);
  const [sessionCount, setSessionCount] = useState(0); // عدد من تم تسجيلهم في هذه الجلسة

  // ------------------------------------------------------------
  // إدارة الإشعارات (Toasts)
  // ------------------------------------------------------------
  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  // ------------------------------------------------------------
  // معالجة نجاح المسح
  // ------------------------------------------------------------
  const handleScanSuccess = useCallback(
    async (decodedText) => {
      if (isProcessingRef.current) return; // تجاهل أي مسح إضافي أثناء المعالجة
      isProcessingRef.current = true;

      const scanner = html5QrCodeRef.current;
      try {
        // إيقاف الكاميرا مؤقتاً فور المسح (لثانية واحدة) لمنع تكرار قراءة نفس الكارت
        if (scanner) {
          try {
            scanner.pause(true);
          } catch {
            /* قد تكون متوقفة بالفعل، تجاهل */
          }
        }

        const student = await db.students
          .where("qrCode")
          .equals(decodedText)
          .first();

        if (!student) {
          pushToast({ type: "error", message: "الكود غير معروف — لا يوجد طالب مطابق." });
          return;
        }

        if (student.isArchived) {
          pushToast({ type: "warning", message: `${student.name} — الطالب مؤرشف حالياً.` });
          return;
        }

        const today = todayStr();

        // تحقق من عدم وجود سجل حضور مسبق لنفس الطالب في نفس اليوم
        const existing = await db.attendance
          .where("[studentId+date]")
          .equals([student.id, today])
          .first();

        if (existing) {
          pushToast({
            type: "warning",
            message: `${student.name} — تم تسجيل حضوره مسبقاً اليوم.`,
          });
          return;
        }

        await db.attendance.add({
          studentId: student.id,
          date: today,
          status: "Present",
        });

        setSessionCount((c) => c + 1);
        pushToast({ type: "success", message: `تم تسجيل حضور: ${student.name}` });
      } catch (err) {
        pushToast({ type: "error", message: "حدث خطأ أثناء تسجيل الحضور. حاول مجدداً." });
      } finally {
        // إعادة تشغيل الكاميرا بعد فترة التهدئة، جاهزة للكارت التالي تلقائياً
        setTimeout(() => {
          isProcessingRef.current = false;
          try {
            html5QrCodeRef.current?.resume();
          } catch {
            /* تجاهل إن كانت الكاميرا قد أُوقفت (مغادرة الشاشة) */
          }
        }, SCAN_COOLDOWN_MS);
      }
    },
    [pushToast]
  );

  // ------------------------------------------------------------
  // تشغيل الكاميرا عند تحميل الشاشة، وإيقافها عند مغادرتها
  // ------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    const html5QrCode = new Html5Qrcode(READER_ELEMENT_ID);
    html5QrCodeRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode
      .start(
        { facingMode: "environment" }, // الكاميرا الخلفية
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => {
          /* أخطاء فك التشفير أثناء البحث عن كود — تحدث باستمرار وطبيعية، تُتجاهل */
        }
      )
      .then(() => {
        if (isMounted) setCameraState("running");
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = String(err?.message || err || "");
        if (/NotAllowedError|Permission/i.test(message)) {
          setCameraState("denied");
        } else {
          setCameraState("error");
        }
        setCameraErrorDetail(message);
      });

    return () => {
      isMounted = false;
      const scanner = html5QrCodeRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            // إن لم تكن قد بدأت أصلاً (مثلاً رُفضت الصلاحية)، تجاهل الخطأ
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto max-w-md px-4 py-6 sm:px-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">تسجيل الحضور</h1>
            <p className="text-sm text-slate-500">وجّه الكاميرا نحو كارنيه الطالب</p>
          </div>
          {onDone && (
            <button
              onClick={onDone}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              إنهاء
            </button>
          )}
        </header>

        {/* عدّاد الجلسة */}
        <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-800">تم تسجيلهم في هذه الجلسة</span>
          <span className="text-lg font-bold text-emerald-700">{sessionCount}</span>
        </div>

        {/* منطقة الكاميرا */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <div id={READER_ELEMENT_ID} className="w-full" />

          {cameraState === "initializing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-white">
              <SpinnerIcon />
              <p className="text-sm">جارِ تشغيل الكاميرا...</p>
            </div>
          )}

          {cameraState === "denied" && (
            <PermissionMessage
              title="تم رفض الوصول إلى الكاميرا"
              description="لتتمكن من مسح الكارنيهات، يجب السماح لهذا المتصفح باستخدام الكاميرا."
              steps={[
                "افتح إعدادات المتصفح (⋮ أو أيقونة القفل بجانب رابط الموقع).",
                "ابحث عن إذن \"الكاميرا\" وفعّله لهذا الموقع.",
                "أعد تحميل الصفحة بعد التفعيل.",
              ]}
            />
          )}

          {cameraState === "error" && (
            <PermissionMessage
              title="تعذّر تشغيل الكاميرا"
              description="قد لا يوجد كاميرا متاحة على هذا الجهاز، أو أن كاميرا أخرى تستخدمها حالياً."
              steps={[
                "تأكد من عدم استخدام تطبيق آخر للكاميرا في نفس الوقت.",
                "جرّب إغلاق الصفحة وإعادة فتحها.",
                "تأكد أنك تستخدم الموقع عبر HTTPS أو localhost.",
              ]}
              detail={cameraErrorDetail}
            />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          يتوقف المسح تلقائياً لثانية واحدة بعد كل عملية ناجحة لتفادي القراءة المزدوجة.
        </p>
      </div>

      {/* حاوية الإشعارات (Toasts) */}
      <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </div>
  );
}

// ======================================================================
// مكوّنات فرعية
// ======================================================================

function Toast({ type, message }) {
  const styles = {
    success: "bg-emerald-600 text-white",
    warning: "bg-amber-500 text-white",
    error: "bg-rose-600 text-white",
  };
  const icon = {
    success: <CheckCircleIcon />,
    warning: <AlertIcon />,
    error: <XCircleIcon />,
  };

  return (
    <div
      className={`flex w-full max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${styles[type]}`}
      role="status"
    >
      {icon[type]}
      <span>{message}</span>
    </div>
  );
}

function PermissionMessage({ title, description, steps, detail }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-slate-900/95 px-6 py-8 text-center text-white">
      <AlertIcon large />
      <h3 className="text-base font-bold">{title}</h3>
      <p className="text-sm text-slate-300">{description}</p>
      <ol className="mt-1 w-full max-w-xs space-y-1.5 text-right text-xs text-slate-300">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {detail && (
        <p className="mt-2 max-w-xs break-words text-[10px] text-slate-500">{detail}</p>
      )}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-8 w-8 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function XCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
function AlertIcon({ large }) {
  const size = large ? 32 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
