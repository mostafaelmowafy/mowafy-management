// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "autoUpdate": يعيد تسجيل نسخة جديدة من Service Worker تلقائياً عند توفرها
      registerType: 'autoUpdate',

      // manifest.json يُدمَج تلقائياً — لا حاجة لملف public/manifest.json منفصل
      // إن كنت تفضل الملف اليدوي (كما أرفقته سابقاً)، احذف هذا الكائن كاملاً
      // واترك vite-plugin-pwa يستخدم public/manifest.json مباشرة عبر includeManifestIcons.
      manifest: {
        name: 'موافي',
        short_name: 'موافي',
        description:
          'نظام محلي (Offline) لإدارة الحضور والتقييم والمدفوعات للمدرّسين',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // استراتيجية Workbox: تخزين كل أصول التطبيق (JS/CSS/HTML) للعمل الكامل بدون إنترنت
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Fallback لأي مسار غير موجود في الكاش (يعيد index.html لدعم تحديث الصفحة داخل PWA)
        navigateFallback: '/index.html',
      },
    }),
  ],
});
