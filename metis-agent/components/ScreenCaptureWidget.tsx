// components/ScreenCaptureWidget.tsx
"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MonitorOff } from "lucide-react";

export default function ScreenCaptureWidget() {
  const [recording, setRecording] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureIntervalRef = useRef<number | null>(null);

  const startScreenshotCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      captureIntervalRef.current = window.setInterval(() => {
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL("image/png");
              setScreenshot(dataUrl);
            }
          }
        }
      }, 333);
      setRecording(true);
    } catch (err) {
      console.error("Error starting capture:", err);
    }
  };

  const stopScreenshotCapture = () => {
    if (captureIntervalRef.current) {
      window.clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }
    setScreenshot(null);
    setRecording(false);
  };

  const handleToggle = () => {
    if (recording) {
      stopScreenshotCapture();
    } else {
      startScreenshotCapture();
    }
  };

  return (
    <div className="p-4">
      <div className="w-full h-64 border rounded-lg flex items-center justify-center bg-black">
        {recording && screenshot ? (
          <img
            src={screenshot}
            alt="Screenshot"
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <MonitorOff className="w-16 h-16 text-muted-foreground" />
        )}
      </div>
      <Button onClick={handleToggle} className="mt-4 w-full">
        {recording ? "Stop Capture" : "Start Capture"}
      </Button>
      {/* Hidden video element */}
      <video ref={videoRef} style={{ display: "none" }} />
    </div>
  );
}
