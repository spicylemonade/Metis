"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsDropdown() {
  // Dummy notifications – in a real app, fetch these dynamically.
  const notifications = [
    { id: 1, message: "Automation suggestion #1 available" },
    { id: 2, message: "New skill bundle added" },
    { id: 3, message: "Action History updated" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-5 w-5" aria-label="Notifications" />
          {/* Notification badge */}
          {notifications.length > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1 text-xs font-bold text-white bg-red-600 rounded-full">
              {notifications.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {notifications.map((n) => (
          <DropdownMenuItem key={n.id}>{n.message}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
