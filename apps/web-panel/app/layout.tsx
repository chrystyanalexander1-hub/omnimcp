import "./globals.css";

export const metadata = {
  title: "OmniMCP AI",
  description: "Panel de administración de OmniMCP AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
