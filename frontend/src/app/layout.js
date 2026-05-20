import "./globals.css";

export const metadata = {
  title: "Smart Vending Machine",
  description: "IoT Vending Machine App",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
