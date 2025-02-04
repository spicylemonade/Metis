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
import { MonitorOff, Monitor } from "lucide-react";

// Register Chart.js components.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// URL for the Flask backend.
const FLASK_SERVER_URL = "http://localhost:5000";

export default function DashboardPage() {
  // Dummy activity data.
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

  // Command input state.
  const [command, setCommand] = useState("");
  const { setHighlightQuery } = useMindMapContext();

  // Recording context.
  const { recording, screenStream, startScreenCapture, stopScreenCapture } = useRecordingContext();

  // Video element ref.
  const videoRef = useRef<HTMLVideoElement>(null);

  // Global recording settings from localStorage.
  const [baseFolder, setBaseFolder] = useState<string | null>(null);
  const [encryptionPassword, setEncryptionPassword] = useState<string>("");

  useEffect(() => {
    const folder = localStorage.getItem("baseFolder");
    const pass = localStorage.getItem("encryptionPassword");
    if (folder) setBaseFolder(folder);
    if (pass) setEncryptionPassword(pass);
  }, []);

  // Summary text state.
  const [summaryText, setSummaryText] = useState<string>("");

  // Attach the screen stream to the video element (if available).
  useEffect(() => {
    if (recording && screenStream && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = screenStream;
      videoRef.current.load();
      videoRef.current
        .play()
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error("Error playing video:", err);
          }
        });
    }
  }, [recording, screenStream]);

  // When the recording button is pressed, simply send a start or stop recording request.
  const handleRecordingToggle = async () => {
    if (recording) {
      // Stop local capture.
      stopScreenCapture();
      // When stopping, call the backend stopRecording API.
      if (baseFolder && encryptionPassword) {
        try {
          const res = await fetch(
            `${FLASK_SERVER_URL}/api/stopRecording?baseFolder=${encodeURIComponent(
              baseFolder
            )}&encryptionPassword=${encodeURIComponent(encryptionPassword)}`,
            { method: "POST" }
          );
          if (!res.ok) {
            const errorText = await res.text();
            console.error("Error stopping recording:", errorText);
          } else {
            const data = await res.json();
            console.log("Recording stopped and processed:", data);
          }
        } catch (err) {
          console.error("Error stopping recording:", err);
        }
        // Then call the summarization endpoint.
        try {
          const res = await fetch(
            `${FLASK_SERVER_URL}/api/summarizeRecording?baseFolder=${encodeURIComponent(baseFolder)}`
          );
          if (!res.ok) {
            const errorText = await res.text();
            console.error("Summarization error:", errorText);
          } else {
            const data = await res.json();
            setSummaryText(data.summary);
            console.log("Summary:", data.summary);
          }
        } catch (err) {
          console.error("Error summarizing recording:", err);
        }
      }
    } else {
      if (!baseFolder || !encryptionPassword) {
        console.error("Global recording folder or encryption password not set in settings.");
        return;
      }
      // Start local capture (if you wish to show the screen stream).
      startScreenCapture();
      // Tell the backend to start recording.
      try {
        const res = await fetch(`${FLASK_SERVER_URL}/api/startRecording`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseFolder }),
        });
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Error starting recording:", errorText);
        } else {
          const data = await res.json();
          console.log("Recording started:", data);
        }
      } catch (err) {
        console.error("Error starting recording:", err);
      }
      setSummaryText("");
    }
  };

  return (
    <div className="space-y-8 p-6 pb-24">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      {/* Top Grid: Activity Summary, Quick Actions, Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Activity Summary</h3>
          <div className="flex-grow">
            <Bar data={activityData} options={activityOptions} />
          </div>
        </Card>
        <Card className="p-4 flex flex-col">
          <h3 className="font-bold mb-2">Quick Actions</h3>
          <div className="flex flex-col space-y-4">
            <div className="flex flex-col gap-4">
              <div className="w-full h-64 border border-input rounded-lg flex items-center justify-center">
                {recording && screenStream ? (
                  <video ref={videoRef} className="w-full h-full object-cover rounded-lg" />
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
          </div>
        </Card>
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
      {/* Secondary Grid: Activity Log & Automations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <Card className="p-4">
          <h3 className="font-bold mb-2">Active Automations</h3>
          <ul className="list-disc ml-5">
            <li>
              <div className="flex justify-between items-center">
                <span>ClickBtnAutomation</span>
                <Button size="sm" variant="destructive">Stop</Button>
              </div>
            </li>
            <li>
              <div className="flex justify-between items-center">
                <span>FillInputAutomation</span>
                <Button size="sm" variant="secondary">Edit</Button>
              </div>
            </li>
          </ul>
          <Button variant="link" className="mt-4">
            Manage Automations
          </Button>
        </Card>
      </div>
      {/* Summary Display */}
      {summaryText && (
        <Card className="p-4 mt-8">
          <h3 className="font-bold mb-2">Recording Summary</h3>
          <p>{summaryText}</p>
        </Card>
      )}
      {/* Fixed Command Box */}
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
              className={`lucide lucide-cheese ${command.trim() !== "" ? "text-accent" : "text-muted-foreground"}`}
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
