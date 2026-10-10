import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explore India — A living atlas of incredible places",
  description:
    "Explore India on an interactive 3D globe: temples, forts, beaches, Himalayan passes and hidden gems across every state, with cinematic journeys and an AI trip planner.",
  keywords: "Explore India, India travel, 3D globe, travel map, Taj Mahal, Kerala, Rajasthan, Himalayas, AI trip planner, itinerary",
  referrer: "no-referrer-when-downgrade",
  openGraph: {
    title: "Explore India — Spin the globe, fly anywhere in India",
    description: "Cinematic journeys across India, every state on a 3D globe, and an AI trip planner grounded in real places.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
