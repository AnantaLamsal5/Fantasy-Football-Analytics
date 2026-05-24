import './globals.css';
import Providers from '@/context/Providers';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Fantasy Football Analytics',
  description: 'Premium AI-driven Fantasy Football Analytics and Predictions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/30">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
