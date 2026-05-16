import './globals.css';
import Providers from '@/context/Providers';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'Fantasy Football Analytics',
  description: 'Premium AI-driven Fantasy Football Analytics and Predictions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/30">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 md:px-8 py-8">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
