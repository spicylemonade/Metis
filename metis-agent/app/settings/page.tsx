"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-semibold">Settings</h2>

      {/* General Settings */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">General Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Language</label>
            <select className="w-full border p-2 rounded">
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Theme</label>
            <select className="w-full border p-2 rounded">
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Privacy Settings */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Privacy Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Data Encryption</label>
            <select className="w-full border p-2 rounded">
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Local Processing</label>
            <select className="w-full border p-2 rounded">
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Integration Settings */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Integration Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">VSCode Integration</label>
            <select className="w-full border p-2 rounded">
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">OpenAI API Key</label>
            <Input placeholder="Enter API Key" />
          </div>
          <div>
            <label className="block text-sm font-medium">WebDriver Path</label>
            <Input placeholder="Path to WebDriver" />
          </div>
        </div>
      </Card>

      {/* Advanced Settings */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Advanced Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Script Execution Policy</label>
            <select className="w-full border p-2 rounded">
              <option>Automatic</option>
              <option>Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Logging Level</label>
            <select className="w-full border p-2 rounded">
              <option>Info</option>
              <option>Debug</option>
              <option>Error</option>
            </select>
          </div>
        </div>
      </Card>

      <Button variant="outline">Save Settings</Button>
    </div>
  );
}
