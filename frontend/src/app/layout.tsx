import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RootLayoutComponent from '@/components/layout/RootLayout'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Material Stock Monitoring System',
  description: 'Enterprise Material Stock Monitoring & Budget Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50`}>
        <RootLayoutComponent>
          {children}
        </RootLayoutComponent>
      </body>
    </html>
  )
}
