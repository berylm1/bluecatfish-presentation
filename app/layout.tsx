import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blue Catfish AI Presentation',
  description: 'Interactive AI-powered presentation about Blue Catfish invasion',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
