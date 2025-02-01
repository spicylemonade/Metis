"use client";

import * as React from "react";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <User className="h-5 w-5" aria-label="Account" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => console.log("Profile clicked")}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => console.log("Settings clicked")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => console.log("Logout clicked")}>
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
