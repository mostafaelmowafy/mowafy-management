// src/App.jsx
// الإطار الجامع للتطبيق: Header علوي + شريط تنقل سفلي (للشاشات الأكثر استخداماً)
// + قائمة جانبية (للشاشات الإدارية) + تبديل الشاشات بحالة React بسيطة (بدون Router)
// السبب في استخدام حالة بسيطة بدل react-router-dom: التطبيق كله شاشة واحدة (SPA)
// بدون حاجة لعناوين URL قابلة للمشاركة أو تاريخ تصفح، فالحالة البسيطة أخف وأنسب
// لتطبيق PWA يعمل بالكامل Offline على جهاز واحد.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from './db/db';
import Dashboard from './components/Dashboard';
import AttendanceScanner from './components/AttendanceScanner';
import Evaluations from './components/Evaluations';
import Payments from './components/Payments';
import Groups from './components/Groups';
import AddStudent from './components/AddStudent';
import Settings from './components/Settings';
import Finance from './components/Finance';
import Statistics from './components/Statistics';
import { getUpcomingSessions, formatSessionWhen } from './lib/schedule';
import {
  loadReminderSettings,
  occurrenceKey,
  isDismissed,
  dismissOccurrence,
} from './lib/reminders';

const CHECK_INTERVAL_MS = 20000; // فحص كل 20 ثانية — خفيف ولا يستهلك بطارية ملحوظة

// تعريف الشاشات: المفتاح، العنوان الظاهر في الـ Header، والأيقونة (لشريط التنقل)
const SCREENS = {
  dashboard: { title: 'الرئيسية', Icon: HomeIcon },
  scanner: { title: 'تسجيل الحضور', Icon: ScanIcon },
  evaluations: { title: 'تقييم الحصة', Icon: StarIcon },
  payments: { title: 'المدفوعات', Icon: WalletIcon },
  groups: { title: 'إدارة المجموعات', Icon: UsersIcon },
  addStudent: { title: 'إضافة طالب', Icon: UserPlusIcon },
  finance: { title: 'المالية', Icon: FinanceIcon },
  statistics: { title: 'الإحصائيات', Icon: StatsIcon },
  settings: { title: 'الإعدادات', Icon: SettingsIcon },
};

// شاشات شريط التنقل السفلي (الأكثر استخداماً يومياً)
const BOTTOM_NAV_KEYS = ['dashboard', 'scanner', 'evaluations', 'payments'];
// شاشات القائمة الجانبية (إدارية، أقل تكراراً)
const SIDEBAR_KEYS = [
  'groups',
  'addStudent',
  'finance',
  'statistics',
  'settings',
];

export default function App() {
  const [view, setView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeReminder, setActiveReminder] = useState(null); // { key, groupId, groupName, date }
  const [startSessionGroupId, setStartSessionGroupId] = useState(null); // مجموعة "ابدأ الحصة"
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentTarget, setStudentTarget] = useState(null); // { groupId, studentId } — نتيجة بحث تم اختيارها
  const notifiedKeysRef = useRef(new Set()); // يمنع تكرار إشعار المتصفح الأصلي لنفس الموعد

  // كل الطلاب والمجموعات محمَّلين دائماً بخفة (بيانات نصية بسيطة) لدعم البحث الفوري
  const allStudents = useLiveQuery(() => db.students.toArray(), [], []);
  const allGroups = useLiveQuery(() => db.groups.toArray(), [], []);
  const groupNameById = useMemo(() => {
    const map = new Map();
    (allGroups || []).forEach((g) => map.set(g.id, g.groupName));
    return map;
  }, [allGroups]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return (allStudents || [])
      .filter((s) => s.name.includes(q))
      .slice(0, 8)
      .map((s) => ({
        ...s,
        groupName: groupNameById.get(s.groupId) || 'بدون مجموعة',
      }));
  }, [allStudents, searchQuery, groupNameById]);

  function goTo(screenKey) {
    setView(screenKey);
    setSidebarOpen(false);
  }

  function goToStudent(student) {
    setStudentTarget({ groupId: student.groupId, studentId: student.id });
    setSearchOpen(false);
    setSearchQuery('');
    goTo('groups');
  }

  function handleStartGroupSession(groupId) {
    setStartSessionGroupId(groupId);
    goTo('evaluations');
  }

  // ------------------------------------------------------------
  // محرّك التنبيهات: يفحص المواعيد القادمة كل 20 ثانية طالما التطبيق مفتوح
  // (نظام تنبيه داخل التطبيق بالكامل — لا يعتمد على أي خادم، انسجاماً مع
  // كون التطبيق Offline بالكامل. راجع src/lib/reminders.js للتفاصيل والقيود)
  // ------------------------------------------------------------
  useEffect(() => {
    async function checkReminders() {
      const settings = loadReminderSettings();
      if (!settings.enabled) {
        setActiveReminder(null);
        return;
      }

      const now = new Date();
      const upcoming = await getUpcomingSessions(10);

      const due = upcoming.find((occ) => {
        const triggerAt = new Date(
          occ.date.getTime() - settings.minutesBefore * 60000,
        );
        return now >= triggerAt && now < occ.date;
      });

      if (!due) {
        setActiveReminder(null);
        return;
      }

      const key = occurrenceKey(due.groupId, due.date);
      if (isDismissed(key)) {
        setActiveReminder(null);
        return;
      }

      setActiveReminder({
        key,
        groupId: due.groupId,
        groupName: due.groupName,
        date: due.date,
      });

      // إشعار المتصفح الأصلي (إن كان الإذن ممنوحاً) — مرة واحدة فقط لكل موعد
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        !notifiedKeysRef.current.has(key)
      ) {
        notifiedKeysRef.current.add(key);
        new Notification('تذكير بموعد حصة', {
          body: `${due.groupName} — ${formatSessionWhen(due.date)}`,
          icon: '/icons/icon-192.png',
        });
      }
    }

    checkReminders();
    const interval = setInterval(checkReminders, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function handleDismissReminder() {
    if (activeReminder) dismissOccurrence(activeReminder.key);
    setActiveReminder(null);
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className="flex min-h-screen flex-col bg-white font-sans text-stone-900"
    >
      {/* ================================================== */}
      {/* Header علوي + بانر التنبيه — مجمّعين في حاوية ثابتة واحدة، بدل ما يكون
          كل واحد فيهم ثابتاً لوحده بإزاحة px محسوبة يدوياً (كانت بتسبب تداخل
          عند السكرول لو اختلف ارتفاع الهيدر الفعلي شعرة عن الرقم المفترَض) */}
      {/* ================================================== */}
      <div className="sticky top-0 z-40">
        <header className="flex items-center justify-between gap-1 border-b border-stone-200 bg-white px-4 py-2.5 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="فتح القائمة"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-50"
          >
            <MenuIcon />
          </button>

          <p className="flex-1 text-center text-sm font-semibold tracking-wide text-amber-800">
            موافي
          </p>

          <button
            onClick={() => setSearchOpen(true)}
            aria-label="بحث عن طالب"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-50"
          >
            <SearchIcon />
          </button>

          <button
            onClick={() => goTo('dashboard')}
            aria-label="الرئيسية"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-50"
          >
            <BackIcon />
          </button>
        </header>

        {/* نافذة البحث السريع عن طالب */}
        {searchOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 px-4 pt-20"
            onClick={() => setSearchOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2.5">
                <SearchIcon />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن طالب بالاسم..."
                  className="flex-1 border-0 text-sm outline-none placeholder:text-stone-400"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="إغلاق البحث"
                  className="text-stone-400 hover:text-stone-600"
                >
                  <CloseIcon />
                </button>
              </div>

              {searchQuery.trim() && searchResults.length === 0 && (
                <p className="py-6 text-center text-sm text-stone-400">
                  لا يوجد طالب بهذا الاسم.
                </p>
              )}

              {searchResults.length > 0 && (
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {searchResults.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => goToStudent(s)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-right hover:bg-stone-50"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-stone-900">
                            {s.name}
                          </span>
                          <span className="block text-xs text-stone-400">
                            {s.groupName}
                          </span>
                        </span>
                        {!!s.isArchived && (
                          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
                            مؤرشف
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* بانر التنبيه بموعد حصة قادمة */}
        {activeReminder && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <BellIcon />
              <span>
                <strong>{activeReminder.groupName}</strong> —{' '}
                {formatSessionWhen(activeReminder.date)}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => goTo('scanner')}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                تسجيل حضور
              </button>
              <button
                onClick={handleDismissReminder}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                تجاهل
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* محتوى الشاشة الحالية */}
      {/* ================================================== */}
      <main className="flex-1 pb-20">
        {view === 'dashboard' && (
          <Dashboard
            onGoToArchive={() => goTo('groups')}
            onStartGroupSession={handleStartGroupSession}
            onGoToGroups={() => goTo('groups')}
            onGoToAddStudent={() => goTo('addStudent')}
            onGoToSettings={() => goTo('settings')}
            onGoToFinance={() => goTo('finance')}
            onGoToStatistics={() => goTo('statistics')}
          />
        )}
        {view === 'scanner' && (
          <AttendanceScanner onDone={() => goTo('dashboard')} />
        )}
        {view === 'evaluations' && (
          <Evaluations
            onDone={() => goTo('dashboard')}
            initialGroupId={startSessionGroupId}
          />
        )}
        {view === 'payments' && <Payments onDone={() => goTo('dashboard')} />}
        {view === 'groups' && (
          <Groups
            onDone={() => goTo('dashboard')}
            studentTarget={studentTarget}
            onConsumedStudentTarget={() => setStudentTarget(null)}
          />
        )}
        {view === 'addStudent' && (
          <AddStudent onDone={() => goTo('dashboard')} />
        )}
        {view === 'finance' && <Finance onDone={() => goTo('dashboard')} />}
        {view === 'statistics' && (
          <Statistics onDone={() => goTo('dashboard')} />
        )}
        {view === 'settings' && <Settings onDone={() => goTo('dashboard')} />}
      </main>

      {/* ================================================== */}
      {/* شريط التنقل السفلي */}
      {/* ================================================== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {BOTTOM_NAV_KEYS.map((key) => {
            const { title, Icon } = SCREENS[key];
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => goTo(key)}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? 'text-amber-800' : 'text-stone-400'
                }`}
              >
                <Icon active={active} />
                {title}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ================================================== */}
      {/* القائمة الجانبية (Sidebar / Hamburger Menu) */}
      {/* ================================================== */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setSidebarOpen(false)}
        >
          {/* الخلفية المعتمة */}
          <div className="absolute inset-0 bg-black/40" />

          {/* لوحة القائمة نفسها — مثبَّتة صراحةً على اليمين (right-0) بدل الاعتماد
              على ترتيب flex مع dir=rtl، لأن ذلك كان يُظهرها على اليسار خطأً */}
          <div
            className="absolute inset-y-0 right-0 flex w-72 max-w-[80%] flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
              <p className="text-sm font-bold text-stone-900">
                الشاشات الإدارية
              </p>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="إغلاق القائمة"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-50"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-col gap-1 p-3">
              {SIDEBAR_KEYS.map((key) => {
                const { title, Icon } = SCREENS[key];
                const active = view === key;
                return (
                  <button
                    key={key}
                    onClick={() => goTo(key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                      active
                        ? 'bg-amber-50 text-amber-800'
                        : 'text-stone-500 hover:bg-stone-50'
                    }`}
                  >
                    <Icon active={active} />
                    {title}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto border-t border-stone-200 p-4">
              <p className="text-[11px] leading-relaxed text-stone-400">
                يعمل هذا التطبيق بالكامل محلياً على جهازك — لا يتم رفع أي بيانات
                لأي خادم خارجي.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================================================
// أيقونات شريط التنقل والقائمة (SVG inline بدون أي مكتبة خارجية)
// ========================================================================
function iconProps(active) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.4 : 2,
  };
}

function HomeIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function ScanIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}
function StarIcon({ active }) {
  return (
    <svg {...iconProps(active)} fill={active ? 'currentColor' : 'none'}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function WalletIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
function UsersIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function UserPlusIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  );
}
function StatsIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function FinanceIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function SettingsIcon({ active }) {
  return (
    <svg {...iconProps(active)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
