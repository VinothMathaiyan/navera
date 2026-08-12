import "./globals.css";

export const metadata = {
  title: "Navera Fresh Paneer — Prepared after your order",
  description:
    "Country cow milk and fresh lemon. Nothing else. Prepared after your order and delivered fresh to your door in Chennai.",
};

export const viewport = {
  themeColor: "#123D28",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Instrument+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
