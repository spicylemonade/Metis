"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [baseFolder, setBaseFolder] = useState("");
  const [encryptionPassword, setEncryptionPassword] = useState("");

  useEffect(() => {
    const savedFolder = localStorage.getItem("baseFolder");
    const savedPassword = localStorage.getItem("encryptionPassword");
    if (savedFolder) setBaseFolder(savedFolder);
    if (savedPassword) setEncryptionPassword(savedPassword);
  }, []);

  const handleChooseFolder = async () => {
    // Try using the File System Access API.
    try {
      const handle = await (window as any).showDirectoryPicker();
      // Note: For security reasons, you cannot get the full absolute path.
      // You may need to ask the user to manually type the full path.
      alert(
        "File picker returned folder name: " +
          handle.name +
          "\nFor full path, please type it in the text field."
      );
      setBaseFolder(handle.name);
    } catch (err) {
      // Fallback: prompt the user.
      const chosen = prompt("Enter the full absolute recording folder path (e.g., C:\\Recordings):", baseFolder || "");
      if (chosen !== null) {
        setBaseFolder(chosen);
      }
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem("baseFolder", baseFolder);
    localStorage.setItem("encryptionPassword", encryptionPassword);
    console.log("Settings saved:", { baseFolder, encryptionPassword });
  };

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
          {/* Recording Settings */}
          <div>
            <label className="block text-sm font-medium">Global Recording Folder (Absolute Path)</label>
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={handleChooseFolder}>
                Choose Folder
              </Button>
              <span>{baseFolder || "No folder selected"}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Encryption Password</label>
            <Input
              placeholder="Enter password for encryption"
              type="password"
              value={encryptionPassword}
              onChange={(e) => setEncryptionPassword(e.target.value)}
            />
          </div>
        </div>
      </Card>
      <Button variant="outline" onClick={handleSaveSettings}>
        Save Settings
      </Button>
    </div>
  );
}
