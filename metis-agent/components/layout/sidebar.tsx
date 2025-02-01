"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Home,
  History,
  Video,
  Code,
  Settings,
  HelpCircle,
  MonitorOff,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MindMap } from "@/components/MindMap"; // Your MindMap component
import { useRecordingContext } from "@/components/RecordingContext";

export function Sidebar() {
  // Destructure the functions from our updated recording context.
  const { recording, startScreenCapture, stopScreenCapture } = useRecordingContext();

  // Handler that calls the appropriate function.
  const handleRecordingToggle = () => {
    if (recording) {
      stopScreenCapture();
    } else {
      startScreenCapture();
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border-r border-border w-64 flex flex-col">
      {/* Logo and Title */}
      <div className="p-4 border-b border-border flex items-center space-x-2">
        <Image
          src="/logo.svg"
          alt="Automation Agent Logo"
          width={32}
          height={32}
        />
        <h1 className="text-xl font-bold">Metis</h1>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </div>
        </Link>
        <Link href="/action-history">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <History className="w-4 h-4" />
            <span>Action History</span>
          </div>
        </Link>
        <Link href="/learn">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <Video className="w-4 h-4" />
            <span>Learn</span>
          </div>
        </Link>
        <Link href="/automations">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <Code className="w-4 h-4" />
            <span>Automations</span>
          </div>
        </Link>
        <Link href="/settings">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </div>
        </Link>
        <Link href="/help-support">
          <div className="flex items-center space-x-2 hover:bg-muted p-2 rounded cursor-pointer">
            <HelpCircle className="w-4 h-4" />
            <span>Help & Support</span>
          </div>
        </Link>
      </nav>

      {/* Mind Map Component */}
      <div className="p-4">
        <MindMap />
      </div>

      {/* Recording Button */}
      <div className="p-4">
        <Button
          variant={recording ? "destructive" : "default"}
          className="w-full flex items-center justify-center space-x-2"
          onClick={handleRecordingToggle}
        >
          {recording ? (
            <>
              <Monitor className="w-4 h-4" />
              <span>Stop Recording</span>
            </>
          ) : (
            <>
              <MonitorOff className="w-4 h-4" />
              <span>Start Recording</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
