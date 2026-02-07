import "../globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import ActivityTracker from "@/components/activitytracker";
import { getCurrentUserId, getCurrentUserEmail } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eagle Eyes Dashboard",
  description: "Smart Building Monitoring & Remote Facility Management",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getCurrentUserId();
  const userEmail = await getCurrentUserEmail();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100 text-gray-900`}
      >
        {userId && <ActivityTracker userId={userId} />}

        <div className="flex h-screen w-screen overflow-hidden">
          <div className="flex flex-col h-full">
            <Sidebar userEmail={userEmail} />
            <div className="p-4">
              <LogoutButton />
            </div>
          </div>

          <main className="flex-1 overflow-y-auto p-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}