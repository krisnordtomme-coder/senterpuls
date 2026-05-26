import { DM_Sans, DM_Serif_Display } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/AuthProvider"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
})

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
})

export const metadata = {
  title: "SenterPuls",
  description: "Intelligent innholdsscanner for kj\u00f8pesentre",
}

export default function RootLayout({ children }) {
  return (
    <html lang="no" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
