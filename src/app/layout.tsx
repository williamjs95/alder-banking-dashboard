import type { Metadata, Viewport } from "next";
import { Besley, Libre_Franklin } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { THEME_SCRIPT } from "@/components/layout/theme-script";
import "./globals.css";

// Libre Franklin for the interface: the plain American gothic of bank forms and
// statements. Besley, a Clarendon, for balances and titles: the letter banks
// have put on their buildings and ledgers since the 1840s.
const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
});
const besley = Besley({ variable: "--font-besley", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Alder", template: "%s · Alder" },
  description:
    "Alder is a business banking dashboard: balances, cash flow, transactions, payments and cards in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#121114" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${franklin.variable} ${besley.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
