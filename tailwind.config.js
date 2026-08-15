// tailwind.config.js
// إعداد Tailwind قياسي بسيط — لا يوجد وضع ليلي/نهاري (تمت إزالته بناءً على طلب
// صريح). التطبيق بلوحة ألوان ثابتة واحدة: أبيض + درجات بني دافئة (stone/amber).

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
