// app/(public)/layout.tsx
import "../globals.css"; // <-- THIS WAS MISSING

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        {children}
      </body>
    </html>
  );
}
