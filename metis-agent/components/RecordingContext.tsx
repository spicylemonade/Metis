// metis-agent/components/RecordingContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface RecordingContextType {
  recording: boolean;
  latestFrame: string | null;
  parsedElements: any[] | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  error: string | null;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recording, setRecording] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [parsedElements, setParsedElements] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Set up listeners for new frames
    const setupEventListeners = async () => {
      try {
        // Listen for new frames from the Tauri backend
        await listen("new-frame", (event: any) => {
          if (event.payload) {
            setLatestFrame(`data:image/png;base64,${event.payload}`);
          }
        });
        
        // Check current recording status on mount
        checkRecordingStatus();
      } catch (err) {
        console.error("Failed to set up event listeners:", err);
      }
    };

    setupEventListeners();

    // Clean up on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Check current recording status
  const checkRecordingStatus = async () => {
    try {
      const isActive = await invoke<boolean>("is_recording_active");
      setRecording(isActive);
      
      if (isActive) {
        startPolling();
      }
    } catch (err) {
      console.error("Error checking recording status:", err);
    }
  };

  const startPolling = () => {
    // Initial delay before starting the interval
    setTimeout(() => {
      const interval = setInterval(async () => {
        try {
          const frame = await invoke<string>("get_latest_frame");
          if (frame) {
            setLatestFrame(`data:image/png;base64,${frame}`);
          }
        } catch (error) {
          console.error("Error fetching latest frame:", error);
        }
      }, 500);
      setPollingInterval(interval);
    }, 2000);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // Start recording using Tauri command
      const result = await invoke<string>("start_recording");
      console.log("Recording started:", result);
      
      // Verify recording
      const verifyResult = await invoke<string>("verify_recording");
      console.log("Recording verified:", verifyResult);
      
      setRecording(true);
      startPolling();
    } catch (err) {
      console.error("Error starting recording:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stopRecording = async () => {
    try {
      setError(null);
      
      // Stop recording using Tauri command
      const result = await invoke<string>("stop_recording", { 
        encryptionPassword: "applebear" 
      });
      console.log("Recording stopped:", result);
      
      setRecording(false);
      stopPolling();
      setLatestFrame(null);
      setParsedElements(null);
    } catch (err) {
      console.error("Error stopping recording:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <RecordingContext.Provider
      value={{
        recording,
        latestFrame,
        parsedElements,
        startRecording,
        stopRecording,
        error,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
};

export const useRecordingContext = () => {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error("useRecordingContext must be used within a RecordingProvider");
  }
  return context;
};