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
import { useRecordingContext } from "@/components/RecordingContext"; // Ensure this is correctly imported
import { automationManager } from "@/lib/automation-manager";
import { actionAnalyzer } from "@/lib/action-analyzer";
import { invoke } from "@tauri-apps/api/core"; // Ensure invoke is imported
import { actionExecutor } from "@/lib/action-executor"; // Assuming this might be used elsewhere, keep if needed

// Register Chart.js components.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  // Command input state.
  const [command, setCommand] = useState("");
  const { setHighlightQuery } = useMindMapContext(); // Assuming this context provides this function

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

    // Set up event listener for new suggestions (example)
    // const unsubscribe = automationManager.onSuggestionAdded((suggestion) => {
    //   setSuggestions((prev) => [suggestion, ...prev].slice(0, 3));
    // });

    // return () => {
    //   unsubscribe(); // Clean up listener if automationManager provides it
    // };
  }, []);

  // Function to fetch recent actions (example implementation)
  const fetchRecentActions = async () => {
    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      // Replace with actual call if actionAnalyzer provides this method
      // const actions = await actionAnalyzer.getActionHistory(oneDayAgo, now, 3);
      const actions: any[] = []; // Placeholder
      setRecentActions(actions);
    } catch (error) {
      console.error("Failed to fetch recent actions:", error);
    }
  };

  // Function to fetch active automations (example implementation)
  const fetchActiveAutomations = async () => {
    try {
      // Replace with actual call if automationManager provides this method
      // const automations = await automationManager.getActiveAutomations();
      const automations: any[] = []; // Placeholder
      setActiveAutomations(automations);
    } catch (error) {
      console.error("Failed to fetch active automations:", error);
    }
  };

  // Function to fetch suggestions (example implementation)
  const fetchSuggestions = async () => {
    try {
      // Replace with actual call if automationManager provides this method
      // const autoSuggestions = await automationManager.getAutomationSuggestions();
      const autoSuggestions: any[] = []; // Placeholder
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

  // --- Updated function to handle command execution OR action name update ---
  const handleCommandExecution = async () => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    setIsCommandLoading(true);

    try {
      if (recording) {
        // --- Recording is ACTIVE: Update the action name ---
        console.log(`Recording active. Updating action name to: "${trimmedCommand}"`);
        // Invoke the new Rust command to update the name in main.csv
        await invoke('update_current_action_name', { name: trimmedCommand });
        console.log("Action name update request sent successfully.");
        // Provide user feedback (e.g., clear input, maybe a success toast)
        setCommand(""); // Clear input after successful update
        setHighlightQuery(""); // Clear highlight if needed

      } else {
        // --- Recording is INACTIVE: Execute the command as an action sequence ---
        console.log(`Recording inactive. Executing command: "${trimmedCommand}"`);
        // Invoke the Rust command that starts the action execution loop
        const result = await invoke('start_act', { command: trimmedCommand });
        console.log("Action execution result:", result);

        // Handle the result (success message or error string)
        if (result === true || (typeof result === 'string' && result.startsWith("Task completed"))) {
          console.log("Command executed successfully.");
          // Maybe show success notification for action execution
        } else {
          // Treat non-true/non-completed string results as warnings/errors
          console.warn("Command execution may have failed or returned unexpected message:", result);
          // Maybe show error notification using the result string (which might be an error message from Rust)
          alert(`Execution Info: ${result}`); // Simple alert for now
        }
        setCommand(""); // Clear input after execution attempt
        setHighlightQuery("");
      }
    } catch (err) {
      console.error("Failed to process command/update name:", err);
      // Show error notification to the user based on context
      const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : "An unknown error occurred");
      // TODO: Display this error nicely to the user (e.g., using a toast notification library)
      alert(`Error: ${errorMessage}`); // Simple alert for now

    } finally {
      setIsCommandLoading(false);
    }
  };
  // --- End of updated function ---


  // Handle stopping an automation (example)
  const handleStopAutomation = async (id: string) => {
    try {
      // await automationManager.setAutomationActive(id, false); // Example call
      console.log("Stopping automation (placeholder):", id);
      fetchActiveAutomations();
    } catch (error) {
      console.error("Failed to stop automation:", error);
    }
  };

  // Handle approving a suggestion (example)
  const handleApproveSuggestion = async (suggestion: any) => {
    try {
      // await automationManager.approveAutomationSuggestion(suggestion); // Example call
      console.log("Approving suggestion (placeholder):", suggestion);
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
      <div className="space-y-8 p-6 pb-24"> {/* Added padding-bottom for command box */}
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
              <div className="w-full h-64 border border-input rounded-lg flex items-center justify-center overflow-hidden bg-muted/30"> {/* Added background color */}
                {recording && latestFrame ? (
                    <img
                        src={latestFrame}
                        alt="Live capture"
                        className="w-full h-full object-contain rounded-lg" // object-contain to fit image
                    />
                ) : recording ? (
                    <Monitor className="w-16 h-16 text-accent" /> // Indicates recording active but no frame yet
                ) : (
                    <MonitorOff className="w-16 h-16 text-muted-foreground" /> // Indicates recording inactive
                )}
              </div>
              <Button
                  variant={recording ? "destructive" : "default"}
                  onClick={handleRecordingToggle}
                  className="w-full"
                  disabled={isCommandLoading} // Disable while commands are processing
              >
                {recording ? "Stop Recording" : "Start Recording"}
              </Button>
            </div>
          </Card>

          <Card className="p-4 flex flex-col">
            <h3 className="font-bold mb-2">Suggested Automations</h3>
            {suggestions.length > 0 ? (
                <ul className="list-disc ml-5 flex-grow space-y-4"> {/* Added space-y */}
                  {suggestions.map((suggestion, index) => (
                      <li key={index}>
                        <p className="text-sm font-medium">{suggestion.name}</p>
                        <p className="text-xs text-muted-foreground mb-1">
                          Similarity: {suggestion.similarity}% {/* Example property */}
                        </p>
                        <div className="flex space-x-2">
                          <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApproveSuggestion(suggestion)}
                              disabled={isCommandLoading}
                          >
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" disabled={isCommandLoading}>
                            Customize
                          </Button>
                        </div>
                      </li>
                  ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground">
                  No automation suggestions yet. Record actions to get suggestions.
                </p>
            )}
            <Button variant="link" className="mt-auto pt-4" onClick={fetchSuggestions} disabled={isCommandLoading}> {/* Push to bottom */}
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
                      <div key={index} className="border-b pb-2 last:border-b-0"> {/* Remove border on last item */}
                        <p className="text-sm">
                          {new Date(action.timestamp).toLocaleTimeString()} - {action.description || "Action recorded"} {/* Example properties */}
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
                  No recent actions recorded. Start recording to track activities.
                </p>
            )}
            <Button variant="link" className="mt-3 px-0" onClick={fetchRecentActions} disabled={isCommandLoading}> {/* Remove padding */}
              View Full Log
            </Button>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold mb-2">Active Automations</h3>
            {activeAutomations.length > 0 ? (
                <ul className="list-disc ml-5 space-y-2"> {/* Added space-y */}
                  {activeAutomations.map((automation) => (
                      <li key={automation.id}> {/* Assuming automation has an id */}
                        <div className="flex justify-between items-center">
                          <span>{automation.name || "Unnamed Automation"}</span> {/* Example properties */}
                          <div className="flex space-x-2">
                            <Button
                                size="sm"
                                variant="outline"
                                // onClick={() => automationManager.runAutomation(automation.id)} // Example call
                                onClick={() => console.log("Run automation:", automation.id)}
                                disabled={isCommandLoading}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleStopAutomation(automation.id)}
                                disabled={isCommandLoading}
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
                  No active automations. Approve suggestions or create custom ones.
                </p>
            )}
            <Button
                variant="link"
                className="mt-4 px-0" // Remove padding
                // onClick={() => window.location.href = "/automations"} // Example navigation
                onClick={() => console.log("Navigate to manage automations")}
                disabled={isCommandLoading}
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
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0"> {/* Make header sticky */}
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Content</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Interactive</th>
                  </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                  {/* Display only top elements for brevity */}
                  {parsedElements.slice(0, 5).map((element, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{element.type || "N/A"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm truncate max-w-xs">{element.content || "N/A"}</td> {/* Truncate long content */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{element.interactivity ? "Yes" : "No"}</td> {/* Example properties */}
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </Card>
        )}

        {/* Fixed Command Box */}
        {/* Ensure parent div allows positioning relative to viewport or specific container */}
        <div className="fixed bottom-0 left-0 md:left-64 right-0 p-4 bg-background border-t"> {/* Added border-t, adjusted left margin for larger screens */}
          <div className="relative max-w-4xl mx-auto"> {/* Center and limit width */}
            <input
                type="text"
                placeholder={recording ? "Enter name for current action..." : "Enter command to execute..."} // Dynamic placeholder
                value={command}
                onChange={(e) => {
                  setCommand(e.target.value);
                  // Optionally update highlight query only when not recording?
                  if (!recording) {
                    setHighlightQuery(e.target.value);
                  } else {
                    setHighlightQuery(""); // Clear highlight when naming action
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCommandLoading) { // Prevent multiple submissions
                    handleCommandExecution();
                  }
                }}
                className="w-full p-4 pr-16 border border-input rounded-full text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" // Adjusted sizes and focus style
                disabled={isCommandLoading} // Disable input while loading
            />
            <div
                onClick={!isCommandLoading ? handleCommandExecution : undefined} // Prevent click while loading
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-colors ${!isCommandLoading ? 'cursor-pointer hover:bg-muted' : 'opacity-50'}`} // Style adjustments
            >
              {/* --- Reverted to Cheese Icon --- */}
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
                  // Use lucide-cheese class again
                  className={`lucide lucide-cheese ${
                      command.trim() !== "" ? "text-primary" : "text-muted-foreground" // Use primary color when active (or text-accent if you preferred that)
                  } ${isCommandLoading ? "animate-pulse" : ""}`}
              >
                {/* Cheese icon paths */}
                <path d="M21 19v-7c-1-6-7-9-7-9l-2.1 1.5a2 2 0 0 1-3 2.2L3 11v9c0 .6.4 1 1 1h3a2 2 0 0 1 4 0h8" />
                <path d="M9 12H3" />
                <path d="M9 12c0-.8 1.3-1.5 3-1.5s3 .7 3 1.5a3 3 0 1 1-6 0" />
                <path d="M21 12h-6" />
                <circle cx="19" cy="19" r="2" />
              </svg>
              {/* --- End of Cheese Icon --- */}
            </div>
          </div>
        </div>
      </div>
  );
}