import "../styles/globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "prepic - Master your interviews",
  openGraph: {
    title: "prepic - Master your interviews",
    description:
      "prepic is an app that helps you master your interviews.",
    images: [
      {
        url: "https://antler-ic-ai.vercel.app/opengraph-image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "prepic - Master your interviews",
    description:
      "prepic is an app that helps you master your interviews.",
    images: ["https://antler-ic-ai.vercel.app/opengraph-image"],
    creator: "@tmeyer_me, @gerwinfricke, @vabatta, @team-9",
  },
  metadataBase: new URL("https://antler-ic-ai.vercel.app"),
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
