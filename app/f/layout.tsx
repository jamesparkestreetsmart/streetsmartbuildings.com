import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Comfort Feedback | Eagle Eyes',
  description: 'Share your comfort feedback to help optimize building conditions.',
};

export default function FeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F8FAFC' }}>
        {children}
      </body>
    </html>
  );
}
