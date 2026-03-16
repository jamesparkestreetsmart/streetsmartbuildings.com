// app/(public)/layout.tsx
import "../globals.css"; // <-- THIS WAS MISSING

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Eagle Eyes Building Solutions LLC",
              alternateName: "Street Smart Buildings",
              url: "https://streetsmartbuildings.com",
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-white">
        {children}
      </body>
    </html>
  );
}
