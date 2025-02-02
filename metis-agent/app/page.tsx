"use client";

import React, { useState, useRef, useEffect } from "react";
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
import { useRecordingContext } from "@/components/RecordingContext";
import { MonitorOff, Monitor } from "lucide-react"; // Import both icons

// Register Chart.js components.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
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

  // State for the command input.
  const [command, setCommand] = useState("");
  const { setHighlightQuery } = useMindMapContext();

  // Use the shared recording context.
  const { recording, screenStream, startScreenCapture, stopScreenCapture } = useRecordingContext();

  // Local ref for handling the video element.
  const videoRef = useRef<HTMLVideoElement>(null);

  // When the recording state changes and a stream is available, attach it to the video element.
  useEffect(() => {
    if (recording && screenStream && videoRef.current) {
      // Pause before setting a new source
      videoRef.current.pause();
      videoRef.current.srcObject = screenStream;
  
      // Optionally call load() to ensure the video element reloads its source.
      videoRef.current.load();
  
      // Then attempt to play, catching any AbortError.
      videoRef.current
        .play()
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error("Error playing video:", err);
          }
        });
    }
  }, [recording, screenStream]);
  

  // Toggle function that uses the context functions.
  const handleRecordingToggle = () => {
    if (recording) {
      stopScreenCapture();
    } else {
      startScreenCapture();
    }
  };

  return (
    <div className="space-y-8 p-6 pb-24">
      {/* Extra bottom padding so content isn't hidden behind the fixed command box */}
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {/* Top Grid: Activity Summary, Quick Actions, Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Activity Summary */}
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Activity Summary</h3>
          <div className="flex-grow">
            <Bar data={activityData} options={activityOptions} />
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Quick Actions</h3>
          <div className="flex flex-col space-y-4">
            {/* Screen Recording Section */}
            <div className="flex flex-col gap-4">
              <div className="w-full h-64 border border-input rounded-lg flex items-center justify-center">
                {recording && screenStream ? (
                  <video ref={videoRef} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  recording ? (
                    // If recording is true but stream not attached yet, show the open monitor icon.
                    <Monitor className="w-16 h-16 text-accent" />
                  ) : (
                    // Otherwise, show the closed monitor icon.
                    <MonitorOff className="w-16 h-16 text-muted-foreground" />
                  )
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
          </div>
        </Card>

        {/* Recent Notifications */}
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Recent Notifications</h3>
          <ul className="list-disc ml-5 flex-grow">
            <li>Automation suggestion #1</li>
            <li>Automation suggestion #2</li>
            <li>Automation suggestion #3</li>
          </ul>
          <Button variant="link" className="mt-4">
            View All Notifications
          </Button>
        </Card>
      </div>

      {/* Secondary Grid: Recent Activity Log & Active Automations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Activity Log */}
        <Card className="p-4">
          <h3 className="font-bold mb-2">Recent Activity Log</h3>
          <div className="space-y-3">
            <div className="border-b pb-2">
              <p className="text-sm">10:15 AM - Clicked Submit button</p>
              <p className="text-xs text-muted-foreground">Element: btn1</p>
            </div>
            <div className="border-b pb-2">
              <p className="text-sm">10:16 AM - Typed "example" in input field</p>
              <p className="text-xs text-muted-foreground">Element: input1</p>
            </div>
            <div className="border-b pb-2">
              <p className="text-sm">10:17 AM - Navigated to Settings</p>
            </div>
          </div>
          <Button variant="link" className="mt-3">
            View Full Log
          </Button>
        </Card>

        {/* Active Automations */}
        <Card className="p-4">
          <h3 className="font-bold mb-2">Active Automations</h3>
          <ul className="list-disc ml-5">
            <li>
              <div className="flex justify-between items-center">
                <span>ClickBtnAutomation</span>
                <Button size="sm" variant="destructive">
                  Stop
                </Button>
              </div>
            </li>
            <li>
              <div className="flex justify-between items-center">
                <span>FillInputAutomation</span>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
              </div>
            </li>
          </ul>
          <Button variant="link" className="mt-4">
            Manage Automations
          </Button>
        </Card>
      </div>

      {/* Fixed Command Box at the Bottom */}
      <div className="fixed bottom-0 left-64 right-0 p-4 bg-background">
        <div className="relative">
          <input
            type="text"
            placeholder="Command..."
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setHighlightQuery(e.target.value);
            }}
            className="w-full p-4 pr-16 border border-input rounded-full text-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div
            onClick={() => {
              console.log("Sending command:", command);
              setCommand("");
              setHighlightQuery("");
            }}
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
              }`}
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
