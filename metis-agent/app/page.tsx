// metis-agent/app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useMindMapContext } from "@/components/MindMapContext";
import { MonitorOff, Monitor, Play, AlertCircle } from "lucide-react";
import { useRecordingContext } from "@/components/RecordingContext";
import { automationManager } from "@/lib/automation-manager";
import { actionAnalyzer } from "@/lib/action-analyzer";
import { invoke } from "@tauri-apps/api/core";
import { actionExecutor } from "@/lib/action-executor";

// Register Chart.js components.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  // Command input state.
  const [command, setCommand] = useState("");
  const { setHighlightQuery } = useMindMapContext();
  
  // Get recording context
  const { recording, latestFrame, parsedElements, startRecording, stopRecording, error } = useRecordingContext();
  
  // State for recent actions and active automations
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [activeAutomations, setActiveAutomations] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isCommandLoading, setIsCommandLoading] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchRecentActions();
    fetchActiveAutomations();
    fetchSuggestions();

    // Set up event listener for new suggestions
    const unsubscribe = automationManager.onSuggestionAdded((suggestion) => {
      setSuggestions((prev) => [suggestion, ...prev].slice(0, 3));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Function to fetch recent actions
  const fetchRecentActions = async () => {
    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const actions = await actionAnalyzer.getActionHistory(oneDayAgo, now, 3);
      setRecentActions(actions);
    } catch (error) {
      console.error("Failed to fetch recent actions:", error);
    }
  };

  // Function to fetch active automations
  const fetchActiveAutomations = async () => {
    try {
      const automations = await automationManager.getActiveAutomations();
      setActiveAutomations(automations);
    } catch (error) {
      console.error("Failed to fetch active automations:", error);
    }
  };

  // Function to fetch suggestions
  const fetchSuggestions = async () => {
    try {
      const autoSuggestions = await automationManager.getAutomationSuggestions();
      setSuggestions(autoSuggestions.slice(0, 3));
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
    }
  };

  // Handle recording toggle.
  const handleRecordingToggle = async () => {
    if (recording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  // Handle command execution
  const handleCommandExecution = async () => {
    if (!command.trim()) return;



    setIsCommandLoading(true);
    try {
      console.log("here bruh");
      // Call the Tauri command 'start_action' with the command text
      const result = await invoke('start_act', { command: command });

      console.log("Action execution result:", result);

      // If action was successful, you might want to update UI or show a notification
      if (result === true) {
        // Success handling (optional)
        console.log("Command executed successfully");
      } else {
        // If result is not true, it might be an error message
        console.warn("Command execution returned:", result);
      }

      // Reset the command
      setCommand("");
      setHighlightQuery("");
    } catch (error) {
      console.error("Failed to execute command:", error);
      // Optionally show an error notification to the user
    } finally {
      setIsCommandLoading(false);
    }
  };

  // Handle stopping an automation
  const handleStopAutomation = async (id: string) => {
    try {
      await automationManager.setAutomationActive(id, false);
      fetchActiveAutomations();
    } catch (error) {
      console.error("Failed to stop automation:", error);
    }
  };

  // Handle approving a suggestion
  const handleApproveSuggestion = async (suggestion: any) => {
    try {
      await automationManager.approveAutomationSuggestion(suggestion);
      fetchSuggestions();
      fetchActiveAutomations();
    } catch (error) {
      console.error("Failed to approve suggestion:", error);
    }
  };

  // Dummy activity data for the chart
  const activityData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      {
        label: "Actions",
        data: [12, 19, 3, 5, 2, 3, 7],
        backgroundColor: "rgba(54, 162, 235, 0.6)",
      },
    ],
  };

  const activityOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Weekly Activity" },
    },
  };

  return (
    <div className="space-y-8 p-6 pb-24">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {/* Top Grid: Activity Summary, Live View, Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Activity Summary</h3>
          <div className="flex-grow">
            <Bar data={activityData} options={activityOptions} />
          </div>
        </Card>
        
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Live View</h3>
          <div className="flex flex-col space-y-4">
            <div className="w-full h-64 border border-input rounded-lg flex items-center justify-center overflow-hidden">
              {recording && latestFrame ? (
                <img
                  src={latestFrame}
                  alt="Live capture"
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : recording ? (
                <Monitor className="w-16 h-16 text-accent" />
              ) : (
                <MonitorOff className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
            <Button
              variant={recording ? "destructive" : "default"}
              onClick={handleRecordingToggle}
              className="w-full"
            >
              {recording ? "Stop Recording" : "Start Recording"}
            </Button>
          </div>
        </Card>
        
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Suggested Automations</h3>
          {suggestions.length > 0 ? (
            <ul className="list-disc ml-5 flex-grow">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="mb-4">
                  <p className="text-sm font-medium">{suggestion.name}</p>
                  <p className="text-xs text-muted-foreground mb-1">
                    Similarity: {suggestion.similarity}%
                  </p>
                  <div className="flex space-x-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleApproveSuggestion(suggestion)}
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary">
                      Customize
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No automation suggestions at the moment. Continue recording your actions to receive personalized suggestions.
            </p>
          )}
          <Button variant="link" className="mt-4" onClick={fetchSuggestions}>
            Refresh Suggestions
          </Button>
        </Card>
      </div>
      
      {/* Secondary Grid: Activity Log & Automations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold mb-2">Recent Activity Log</h3>
          {recentActions.length > 0 ? (
            <div className="space-y-3">
              {recentActions.map((action, index) => (
                <div key={index} className="border-b pb-2">
                  <p className="text-sm">
                    {new Date(action.timestamp).toLocaleTimeString()} - {action.description}
                  </p>
                  {action.element && (
                    <p className="text-xs text-muted-foreground">
                      Element: {action.element}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recent actions recorded. Start recording to track your activities.
            </p>
          )}
          <Button variant="link" className="mt-3" onClick={fetchRecentActions}>
            View Full Log
          </Button>
        </Card>
        
        <Card className="p-4">
          <h3 className="font-bold mb-2">Active Automations</h3>
          {activeAutomations.length > 0 ? (
            <ul className="list-disc ml-5">
              {activeAutomations.map((automation) => (
                <li key={automation.id}>
                  <div className="flex justify-between items-center">
                    <span>{automation.name}</span>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => automationManager.runAutomation(automation.id)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleStopAutomation(automation.id)}
                      >
                        Stop
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active automations. Approve suggestions or create custom automations.
            </p>
          )}
          <Button 
            variant="link" 
            className="mt-4"
            onClick={() => window.location.href = "/automations"}
          >
            Manage Automations
          </Button>
        </Card>
      </div>
      
      {/* Parsed Elements Display (when recording) */}
      {recording && parsedElements && parsedElements.length > 0 && (
        <Card className="p-4 mt-8">
          <h3 className="font-bold mb-2">Detected UI Elements</h3>
          <div className="max-h-48 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Content</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Interactive</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                {parsedElements.slice(0, 5).map((element, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{element.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{element.content || "N/A"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{element.interactivity ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      
      {/* Fixed Command Box */}
      <div className="fixed bottom-0 left-64 right-0 p-4 bg-background">
        <div className="relative">
          <input
            type="text"
            placeholder="Command (e.g., 'run automation' or 'click button')"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setHighlightQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCommandExecution();
              }
            }}
            className="w-full p-4 pr-16 border border-input rounded-full text-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div
            onClick={handleCommandExecution}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`lucide lucide-cheese ${
                command.trim() !== "" ? "text-accent" : "text-muted-foreground"
              } ${isCommandLoading ? "animate-pulse" : ""}`}
            >
              <path d="M21 19v-7c-1-6-7-9-7-9l-2.1 1.5a2 2 0 0 1-3 2.2L3 11v9c0 .6.4 1 1 1h3a2 2 0 0 1 4 0h8" />
              <path d="M9 12H3" />
              <path d="M9 12c0-.8 1.3-1.5 3-1.5s3 .7 3 1.5a3 3 0 1 1-6 0" />
              <path d="M21 12h-6" />
              <circle cx="19" cy="19" r="2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}