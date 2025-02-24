"use client";

import React, { createContext, useContext, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RecordingContextType {
  recording: boolean;
  latestFrame: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recording, setRecording] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const startPolling = () => {
    setTimeout(() => {
      const interval = setInterval(async () => {
        try {
          const frame: string = await invoke("get_latest_frame");
          setLatestFrame(`data:image/png;base64,${frame}`);
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
      const startResponse = await invoke("start_recording");
      console.log("Recording started:", startResponse);
      const verifyResponse = await invoke("verify_recording");
      console.log("Recording verified:", verifyResponse);
      startPolling();
      setRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = async () => {
    try {
      const stopResponse = await invoke("stop_recording", { encryptionPassword: "applebear" });
      console.log("Recording stopped and processed:", stopResponse);
      stopPolling();
      setRecording(false);
      setLatestFrame(null);
    } catch (err) {
      console.error("Error stopping recording:", err);
    }
  };

  return (
    <RecordingContext.Provider value={{ recording, latestFrame, startRecording, stopRecording }}>
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
