import "../styles/globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AIPrep - GPT-Powered Case Interviews",
  openGraph: {
    title: "AIPrep - GPT-Powered Case Interviews",
    description:
      "AIPrep is the GPT-powered case interview platform that helps you practice for your consulting interview.",
    images: [
      {
        url: "https://ai-prep-nine.vercel.app/opengraph-image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIPrep - GPT-Powered Case Interviews",
    description:
      "AIPrep is the GPT-powered case interview platform that helps you practice for your consulting interview.",
    images: ["https://ai-prep-nine.vercel.app/opengraph-image"],
    creator: "@tmeyer_me, @gerwinfricke", 
  },
  metadataBase: new URL("https://ai-prep-nine.vercel.app"),
  themeColor: "#FFF",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="scroll-smooth antialiased [font-feature-settings:'ss01']">
        {children}
      </body>
    </html>
  );
}
