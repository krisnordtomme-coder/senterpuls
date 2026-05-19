import "./globals.css"

export const metadata = {
  title: "SenterPuls – Værstetorvet",
  description: "Intelligent innholdsscanner for Værstetorvet",
}

export default function RootLayout({ children }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  )
}