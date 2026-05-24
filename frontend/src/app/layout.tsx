import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'DocFlow - 문서관리시스템',
  description: '체계적인 문서 관리를 위한 SaaS 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
