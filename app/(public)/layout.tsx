// app/(public)/layout.tsx

import "@/app/globals.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* BODY styles only provide *outer* background. The signup page has its own gradient. */}
      <body className="min-h-screen bg-gray-50 antialiased">
        {children}
      </body>
    </html>
  );
}
