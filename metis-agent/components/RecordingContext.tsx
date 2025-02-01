"use client";

import React, { createContext, useContext, useState } from "react";

interface RecordingContextType {
  recording: boolean;
  screenStream: MediaStream | null;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recording, setRecording] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const startScreenCapture = async () => {
    // If already capturing, do nothing.
    if (screenStream) return;

    try {
      // Request a screen capture stream.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      setRecording(true);
    } catch (err) {
      console.error("Error starting screen capture:", err);
      // Optionally alert the user.
    }
  };

  const stopScreenCapture = () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }
    setRecording(false);
  };

  return (
    <RecordingContext.Provider
      value={{ recording, screenStream, startScreenCapture, stopScreenCapture }}
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
