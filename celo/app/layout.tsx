import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Chakra_Petch, Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Shell } from '@/components/Shell';
import { THEME_COOKIE, authDisabled } from '@/lib/config';
import { configured } from '@/lib/sync';
import { partners } from '@/lib/queries';

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-cormorant', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--f-inter', display: 'swap' });
const chakra = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600'], variable: '--f-chakra', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--f-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Celo Command', template: '%s · Celo Command' },
  description: 'Celo Digital internal command center',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#09090a', width: 'device-width', initialScale: 1 };

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = cookies().get(THEME_COOKIE)?.value === 'cave' ? 'cave' : 'penthouse';
  let anyConfigured = false;
  let partnerLinks: { name: string; slug: string }[] = [];
  try {
    anyConfigured = Object.values(await configured()).some(Boolean);
    partnerLinks = (await partners()).map((p) => ({ name: p.name, slug: p.slug }));
  } catch {
    /* database unreachable: the page itself will show the error */
  }
  return (
    <html lang="en" data-theme={theme} className={`${cormorant.variable} ${inter.variable} ${chakra.variable} ${mono.variable}`}>
      <body>
        <Shell theme={theme} authOff={authDisabled()} configured={anyConfigured} partners={partnerLinks}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
