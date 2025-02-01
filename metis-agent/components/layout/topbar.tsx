"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

import { ModeToggle } from "@/components/ModeToggle";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { AccountDropdown } from "@/components/AccountDropdown";

// Define a mapping of pages and keywords.
const pageKeywords = [
  { page: "/", keywords: ["dashboard", "home"] },
  { page: "/action-history", keywords: ["action", "history", "log"] },
  { page: "/learn", keywords: ["learn", "video", "skill", "bundle", "market"] },
  { page: "/automations", keywords: ["automation", "automate", "script"] },
  { page: "/settings", keywords: ["settings", "configuration", "preferences"] },
  { page: "/help-support", keywords: ["help", "support", "faq", "docs"] },
];

export function TopBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const lowerQuery = query.toLowerCase();

    let matchedPage: string | null = null;
    for (const { page, keywords } of pageKeywords) {
      if (keywords.some((keyword) => lowerQuery.includes(keyword))) {
        matchedPage = page;
        break;
      }
    }

    // If no match is found, default to the Dashboard.
    router.push(matchedPage || "/");
  };

  return (
    <div className="flex items-center justify-between p-4 border-b">
      {/* Global Search */}
      <form onSubmit={handleSearch} className="flex items-center">
        <Input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mr-2"
        />
      
      </form>

      {/* Right-side Controls: Theme, Notifications, and Account */}
      <div className="flex items-center space-x-4">
        <ModeToggle />
        <NotificationsDropdown />
        <AccountDropdown />
      </div>
    </div>
  );
}
