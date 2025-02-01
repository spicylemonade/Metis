import "@/app/globals.css";
import { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { ThemeProvider } from "@/components/theme-provider";
import { MindMapProvider } from "@/components/MindMapContext";
import { RecordingProvider } from "@/components/RecordingContext";
import React from "react";

export const metadata: Metadata = {
  title: "Automation Agent",
  description: "Manage your automation tasks seamlessly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MindMapProvider>
            <RecordingProvider>
              <div className="flex h-screen w-screen">
                <Sidebar />
                <div className="flex flex-col flex-1">
                  <TopBar />
                  <main className="p-4 overflow-auto flex-1">{children}</main>
                </div>
              </div>
            </RecordingProvider>
          </MindMapProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
