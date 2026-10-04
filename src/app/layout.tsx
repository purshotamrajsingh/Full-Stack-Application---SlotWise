import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SlotWise — Bookings & analytics for service businesses",
  description:
    "Online booking, staff schedules and a live performance dashboard for clinics, salons, tutors and physiotherapists. Double-bookings are impossible by design.",
  keywords: [
    "SlotWise",
    "booking",
    "appointments",
    "scheduling",
    "analytics",
    "salon software",
    "clinic software",
  ],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "SlotWise — Bookings & analytics for service businesses",
    description:
      "3-click booking, zero double-bookings, live analytics for small service businesses.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d1c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" rich closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
