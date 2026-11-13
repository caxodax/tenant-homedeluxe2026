import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D0E" },
  ],
};

export const metadata: Metadata = {
  title: "MarketOS - Plataforma Multi-Tenant",
  description: "Plataforma de comercio minorista y punto de venta de alta disponibilidad",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "MarketOS",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const isLoginPage = window.location.pathname.includes('/login');
                const savedTheme = localStorage.getItem('marketos-theme');
                if (isLoginPage) {
                  document.documentElement.classList.remove('dark');
                } else if (savedTheme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else if (savedTheme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  // Por defecto en navegación general: claro
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="bg-[#FAF8F5] dark:bg-[#0D0D0E] text-stone-900 dark:text-zinc-100 font-sans text-[15px] leading-relaxed antialiased min-h-screen transition-colors duration-200">
        {children}
        <Toaster
          richColors
          position="top-right"
          offset={{ top: 76, right: 20 }}
          mobileOffset={{ top: 72, right: 12 }}
        />
        <PwaRegister />
      </body>
    </html>
  );
}
