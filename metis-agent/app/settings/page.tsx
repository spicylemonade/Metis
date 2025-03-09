// metis-agent/app/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, Loader, Save, FolderOpen, Download, Upload, Database, RefreshCcw } from "lucide-react";
import { DatabaseManager } from "@/lib/database-manager";

export default function SettingsPage() {
  // General settings
  const [language, setLanguage] = useState("English");
  const [theme, setTheme] = useState("system");
  
  // Privacy settings
  const [dataEncryption, setDataEncryption] = useState(true);
  const [localProcessing, setLocalProcessing] = useState(true);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  
  // Integration settings
  const [vscodeIntegration, setVscodeIntegration] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [webdriverPath, setWebdriverPath] = useState("");
  
  // Advanced settings
  const [scriptExecutionPolicy, setScriptExecutionPolicy] = useState("manual");
  const [loggingLevel, setLoggingLevel] = useState("info");
  const [baseFolder, setBaseFolder] = useState("");
  
  // Database stats
  const [dbStats, setDbStats] = useState<{
    size: number;
    tables: { name: string; rows: number }[];
    lastModified: string;
  } | null>(null);
  
  // UI states
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadDatabaseStats();
  }, []);

  // Function to load settings
  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load from localStorage first (as a fallback/cache)
      const savedSettings = localStorage.getItem("metisSettings");
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setLanguage(settings.language || "English");
        setTheme(settings.theme || "system");
        setDataEncryption(settings.dataEncryption !== false);
        setLocalProcessing(settings.localProcessing !== false);
        setEncryptionPassword(settings.encryptionPassword || "");
        setVscodeIntegration(settings.vscodeIntegration === true);
        setOpenaiApiKey(settings.openaiApiKey || "");
        setWebdriverPath(settings.webdriverPath || "");
        setScriptExecutionPolicy(settings.scriptExecutionPolicy || "manual");
        setLoggingLevel(settings.loggingLevel || "info");
        setBaseFolder(settings.baseFolder || "");
      }
      
      // Try to load from Tauri backend (which is the source of truth)
      try {
        const backendSettings = await invoke("get_settings");
        if (backendSettings) {
          // Update state with backend settings
          const settings = JSON.parse(backendSettings as string);
          setLanguage(settings.language || language);
          setTheme(settings.theme || theme);
          setDataEncryption(settings.dataEncryption !== false);
          setLocalProcessing(settings.localProcessing !== false);
          setVscodeIntegration(settings.vscodeIntegration === true);
          setOpenaiApiKey(settings.openaiApiKey || openaiApiKey);
          setWebdriverPath(settings.webdriverPath || webdriverPath);
          setScriptExecutionPolicy(settings.scriptExecutionPolicy || scriptExecutionPolicy);
          setLoggingLevel(settings.loggingLevel || loggingLevel);
          setBaseFolder(settings.baseFolder || baseFolder);
          // Don't override encryption password if it's already set
          if (settings.encryptionPassword && !encryptionPassword) {
            setEncryptionPassword(settings.encryptionPassword);
          }
        }
      } catch (err) {
        console.warn("Could not load settings from backend, using localStorage:", err);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings. Using defaults.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to load database stats
  const loadDatabaseStats = async () => {
    try {
      const stats = await DatabaseManager.getStats();
      setDbStats(stats);
    } catch (err) {
      console.error("Failed to load database stats:", err);
    }
  };

  // Function to choose base folder
  const handleChooseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Recording Folder"
      });
      
      if (selected && !Array.isArray(selected)) {
        setBaseFolder(selected);
      }
    } catch (err) {
      console.error("Failed to choose folder:", err);
      
      // Fallback: prompt the user
      const chosen = prompt("Enter the full absolute recording folder path (e.g., C:\\Recordings):", baseFolder || "");
      if (chosen !== null) {
        setBaseFolder(chosen);
      }
    }
  };

  // Function to save settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      // Prepare settings object
      const settings = {
        language,
        theme,
        dataEncryption,
        localProcessing,
        encryptionPassword,
        vscodeIntegration,
        openaiApiKey,
        webdriverPath,
        scriptExecutionPolicy,
        loggingLevel,
        baseFolder
      };
      
      // Save to localStorage as a fallback/cache
      localStorage.setItem("metisSettings", JSON.stringify(settings));
      
      // Save to Tauri backend
      try {
        await invoke("save_settings", { settings: JSON.stringify(settings) });
      } catch (err) {
        console.warn("Could not save settings to backend, saved to localStorage only:", err);
      }
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Function to create database backup
  const handleCreateBackup = async () => {
    try {
      const backupPath = await databaseManager.createBackup();
      if (backupPath) {
        alert(`Database backup created successfully at: ${backupPath}`);
      } else {
        setError("Failed to create database backup.");
      }
    } catch (err) {
      console.error("Failed to create database backup:", err);
      setError("Failed to create database backup. Please try again.");
    }
  };

  // Function to restore database from backup
  const handleRestoreBackup = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Database Backup", extensions: ["db", "sqlite", "backup"] }],
        multiple: false,
        title: "Select Database Backup"
      });
      
      if (selected && !Array.isArray(selected)) {
        const confirmed = confirm("Are you sure you want to restore from this backup? This will replace your current database.");
        if (confirmed) {
          const success = await databaseManager.restoreFromBackup(selected);
          if (success) {
            alert("Database restored successfully!");
            loadDatabaseStats();
          } else {
            setError("Failed to restore database backup.");
          }
        }
      }
    } catch (err) {
      console.error("Failed to restore database backup:", err);
      setError("Failed to restore database backup. Please try again.");
    }
  };

  // Function to reset all settings
  const handleResetSettings = () => {
    const confirmed = confirm("Are you sure you want to reset all settings to default? This cannot be undone.");
    if (confirmed) {
      localStorage.removeItem("metisSettings");
      setLanguage("English");
      setTheme("system");
      setDataEncryption(true);
      setLocalProcessing(true);
      setEncryptionPassword("");
      setVscodeIntegration(false);
      setOpenaiApiKey("");
      setWebdriverPath("");
      setScriptExecutionPolicy("manual");
      setLoggingLevel("info");
      setBaseFolder("");
    }
  };
  
  // Format database size for display
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <Button onClick={handleSaveSettings} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
          <Button variant="link" className="p-0 mt-2" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded">
          <p>Settings saved successfully!</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      ) : (
        <>
          {/* General Settings */}
          <Card className="p-4">
            <h3 className="font-bold mb-4">General Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Language</label>
                <select
                  className="w-full border p-2 rounded"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Japanese">Japanese</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Theme</label>
                <select
                  className="w-full border p-2 rounded"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Privacy Settings */}
          <Card className="p-4">
            <h3 className="font-bold mb-4">Privacy Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Data Encryption</label>
                <select
                  className="w-full border p-2 rounded"
                  value={dataEncryption ? "enabled" : "disabled"}
                  onChange={(e) => setDataEncryption(e.target.value === "enabled")}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, all recorded actions and screens will be encrypted using AES-256.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Local Processing</label>
                <select
                  className="w-full border p-2 rounded"
                  value={localProcessing ? "enabled" : "disabled"}
                  onChange={(e) => setLocalProcessing(e.target.value === "enabled")}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, all processing happens locally without sending data to external servers.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Encryption Password</label>
                <Input
                  type="password"
                  placeholder="Enter password for encryption"
                  value={encryptionPassword}
                  onChange={(e) => setEncryptionPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This password is used to encrypt your recorded actions. Keep it safe!
                </p>
              </div>
            </div>
          </Card>

          {/* Integration Settings */}
          <Card className="p-4">
            <h3 className="font-bold mb-4">Integration Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">VSCode Integration</label>
                <select
                  className="w-full border p-2 rounded"
                  value={vscodeIntegration ? "enabled" : "disabled"}
                  onChange={(e) => setVscodeIntegration(e.target.value === "enabled")}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Allows Metis to interact with VSCode for code generation and execution.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">OpenAI API Key</label>
                <Input
                  placeholder="Enter OpenAI API Key"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  type="password"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Used for enhanced AI capabilities and understanding.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">WebDriver Path</label>
                <div className="flex items-center space-x-2">
                  <Input
                    placeholder="Path to WebDriver"
                    value={webdriverPath}
                    onChange={(e) => setWebdriverPath(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={async () => {
                    const selected = await open({
                      filters: [{ name: "Executables", extensions: ["exe"] }],
                      multiple: false
                    });
                    if (selected && !Array.isArray(selected)) {
                      setWebdriverPath(selected);
                    }
                  }}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Path to WebDriver executable for web automation.
                </p>
              </div>
            </div>
          </Card>

          {/* Advanced Settings */}
          <Card className="p-4">
            <h3 className="font-bold mb-4">Advanced Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Script Execution Policy</label>
                <select
                  className="w-full border p-2 rounded"
                  value={scriptExecutionPolicy}
                  onChange={(e) => setScriptExecutionPolicy(e.target.value)}
                >
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                  <option value="approval">Require Approval</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Controls how and when automation scripts are executed.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logging Level</label>
                <select
                  className="w-full border p-2 rounded"
                  value={loggingLevel}
                  onChange={(e) => setLoggingLevel(e.target.value)}
                >
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warning</option>
                  <option value="error">Error</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Sets the detail level for application logs.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Global Recording Folder</label>
                <div className="flex items-center space-x-2">
                  <Input
                    value={baseFolder}
                    onChange={(e) => setBaseFolder(e.target.value)}
                    placeholder="Select folder for recordings..."
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleChooseFolder}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Where to store screen recordings and action data.
                </p>
              </div>
            </div>
          </Card>

          {/* Database Management */}
          <Card className="p-4">
            <h3 className="font-bold mb-4">Database Management</h3>
            <div className="space-y-4">
              {dbStats ? (
                <div className="border rounded-md p-4 bg-muted/30">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Database Size:</span>
                    <span className="text-sm">{formatSize(dbStats.size)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Last Modified:</span>
                    <span className="text-sm">{new Date(dbStats.lastModified).toLocaleString()}</span>
                  </div>
                  <div className="mb-2">
                    <span className="text-sm font-medium">Tables:</span>
                    <div className="mt-1 space-y-1">
                      {dbStats.tables.map((table) => (
                        <div key={table.name} className="flex justify-between text-xs">
                          <span>{table.name}</span>
                          <span>{table.rows} rows</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={loadDatabaseStats}
                  >
                    <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2" />
                  <p>Database statistics not available</p>
                </div>
              )}
              
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleCreateBackup}
                >
                  <Download className="mr-2 h-4 w-4" /> Backup Database
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleRestoreBackup}
                >
                  <Upload className="mr-2 h-4 w-4" /> Restore Backup
                </Button>
              </div>
            </div>
          </Card>

          {/* Reset Options */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleResetSettings}>
              Reset All Settings
            </Button>
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}