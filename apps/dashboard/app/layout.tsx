import type { Metadata } from "next"
import { Geist } from "next/font/google"
import Link from "next/link"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "DripEngine Dashboard",
  description: "Monitor your email sequences",
}

const NAV = [
  { href: "/",           label: "Overview"  },
  { href: "/sequences",  label: "Sequences" },
  { href: "/contacts",   label: "Contacts"  },
  { href: "/logs",       label: "Logs"      },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        <div className="flex min-h-screen">
          <aside className="w-52 shrink-0 border-r border-zinc-800 flex flex-col">
            <div className="px-5 py-5 border-b border-zinc-800">
              <p className="text-sm font-semibold tracking-tight text-white">DripEngine</p>
              <p className="text-xs text-zinc-500 mt-0.5">Dashboard</p>
            </div>
            <nav className="flex flex-col gap-0.5 p-3 flex-1">
              {NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="px-5 py-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-600">v0.1.0</p>
            </div>
          </aside>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}