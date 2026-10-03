import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Brevet Panorama — édition portable',
  description: 'Gestion locale des résultats du brevet et du brevet blanc.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
