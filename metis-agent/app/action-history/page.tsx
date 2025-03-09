// metis-agent/app/action-history/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionAnalyzer } from "@/lib/action-analyzer";
import { automationManager } from "@/lib/automation-manager";
import { Search, Calendar, Play, Download, Filter, RefreshCcw, Star } from "lucide-react";

interface ActionRecord {
  id: string;
  timestamp: number;
  type: string;
  description: string;
  element?: string;
  coordinates?: [number, number];
  details?: Record<string, any>;
}
type AutomationAction =
  | { type: "click"; params: { x: number; y: number } }
  | { type: "type"; params: { text: string } }
  | { type: "scroll"; params: { direction: string; amount: number } };

export default function ActionHistoryPage() {
  // State for action records
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [filteredActions, setFilteredActions] = useState<ActionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Load actions on mount
  useEffect(() => {
    fetchActions();
  }, []);

  // Update filtered actions when search term changes
  useEffect(() => {
    filterActions();
  }, [searchTerm, typeFilter, startDate, endDate, actions]);

  // Function to fetch action history
  const fetchActions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get actions from the last 7 days
      const endTime = Date.now();
      const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 days ago
      const data = await actionAnalyzer.getActionHistory(startTime, endTime, 100);
      setActions(data);
    } catch (err) {
      setError("Failed to load action history. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to filter actions based on search and filters
  const filterActions = () => {
    let filtered = [...actions];

    // Apply search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (action) =>
          action.description.toLowerCase().includes(term) ||
          (action.element && action.element.toLowerCase().includes(term)) ||
          action.type.toLowerCase().includes(term)
      );
    }

    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter((action) => action.type === typeFilter);
    }

    // Apply date filters
    if (startDate) {
      const startTimestamp = new Date(startDate).getTime();
      filtered = filtered.filter((action) => action.timestamp >= startTimestamp);
    }

    if (endDate) {
      const endTimestamp = new Date(endDate).getTime() + 86400000; // Add one day to include the end date
      filtered = filtered.filter((action) => action.timestamp <= endTimestamp);
    }

    setFilteredActions(filtered);
  };

  // Function to clear all filters
  const clearFilters = () => {
    setSearchTerm("");
    setTypeFilter(null);
    setStartDate("");
    setEndDate("");
  };

  // Function to create automation from selected actions
  const createAutomationFromActions = async (
    actions: ActionRecord[],
    name = "New Automation"
  ) => {
    try {
      // Map actions to automation actions
      const automationActions = actions
  .map((action) => {
    switch (action.type) {
      case "click":
        return {
          type: "click",
          params: {
            x: action.coordinates?.[0] || 0,
            y: action.coordinates?.[1] || 0,
          },
        } as AutomationAction;
      case "type":
        return {
          type: "type",
          params: {
            text: action.details?.text || "",
          },
        } as AutomationAction;
      case "scroll":
        return {
          type: "scroll",
          params: {
            direction: action.details?.direction || "down",
            amount: action.details?.amount || 1,
          },
        } as AutomationAction;
      default:
        return null;
    }
  })
  .filter((action): action is AutomationAction => action !== null);


      // Create the automation
      await automationManager.createAutomation({
        name,
        description: `Automation created from ${actions.length} actions in history`,
        isActive: true,
        trigger: {
          type: "command",
          conditions: {
            command: name.toLowerCase(),
          },
        },
        actions: automationActions,
      });

      alert("Automation created successfully!");
    } catch (err) {
      setError("Failed to create automation. Please try again.");
    }
  };

  // Function to export action history as CSV
  const exportAsCSV = () => {
    // Create CSV content
    const headers = ["ID", "Timestamp", "Type", "Description", "Element", "Details"];
    const rows = filteredActions.map((action) => [
      action.id,
      new Date(action.timestamp).toISOString(),
      action.type,
      action.description,
      action.element || "",
      JSON.stringify(action.details || {}),
    ]);

    const csvContent =
      headers.join(",") +
      "\n" +
      rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    // Create a download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `action_history_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get unique action types for filter dropdown
  const actionTypes = Array.from(new Set(actions.map((action) => action.type)));

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Action History</h2>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={fetchActions}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportAsCSV}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-col space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search actions..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              <select
                className="w-full h-10 px-3 py-2 rounded-md border border-input"
                value={typeFilter || ""}
                onChange={(e) => setTypeFilter(e.target.value || null)}
              >
                <option value="">All Action Types</option>
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex space-x-2">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-32"
                />
              </div>
              <span className="self-center">to</span>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>

            <Button variant="outline" size="icon" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {/* Action History Table */}
          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredActions.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Element
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredActions.map((action) => (
                    <tr key={action.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs 
                            ${action.type === "click" ? "bg-blue-100 text-blue-800" : ""}
                            ${action.type === "type" ? "bg-green-100 text-green-800" : ""}
                            ${action.type === "scroll" ? "bg-purple-100 text-purple-800" : ""}
                            ${
                              !["click", "type", "scroll"].includes(action.type)
                                ? "bg-gray-100 text-gray-800"
                                : ""
                            }
                          `}
                        >
                          {action.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{action.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {action.element || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createAutomationFromActions([action])}
                          >
                            <Star className="h-3 w-3 mr-1" /> Create
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Execute this action once
                              // This is a placeholder - in a real app, you'd use actionExecutor
                              alert(`Replay action: ${action.description}`);
                            }}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg">
              <p className="text-muted-foreground">No actions found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters or performing some actions while recording
              </p>
            </div>
          )}

          {filteredActions.length > 0 && (
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {filteredActions.length} of {actions.length} actions
              </p>
              {filteredActions.length > 1 && (
                <Button
                  variant="default"
                  onClick={() => createAutomationFromActions(filteredActions)}
                >
                  <Star className="mr-2 h-4 w-4" /> Create Sequence From {filteredActions.length} Actions
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}