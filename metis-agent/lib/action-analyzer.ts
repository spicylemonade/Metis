// metis-agent/lib/action-analyzer.ts
import { invoke } from "@tauri-apps/api/core";
import { Event, listen } from "@tauri-apps/api/event";

export interface UIElement {
  id: string;
  type: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  interactivity: boolean;
  content: string | null;
  source: string;
}

export interface ParsedScreenContent {
  elements: UIElement[];
  rawData: string;
  timestamp: number;
}

export interface ActionSuggestion {
  id: string;
  name: string;
  description: string;
  confidence: number;
  similarity: number;
  actions: Array<{
    type: string;
    params: any;
  }>;
}

export interface ActionPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  lastExecuted: number;
  contexts: string[];
  actions: Array<{
    type: string;
    params: any;
  }>;
}

/**
 * Service for analyzing user actions and screen content
 */
export class ActionAnalyzer {
  private static instance: ActionAnalyzer;
  private isRecording = false;
  private onNewFrameCallbacks: Array<(content: ParsedScreenContent) => void> = [];
  private onActionDetectedCallbacks: Array<(action: any) => void> = [];

  private constructor() {
    this.initializeEventListeners();
  }

  /**
   * Get singleton instance of ActionAnalyzer
   */
  public static getInstance(): ActionAnalyzer {
    if (!ActionAnalyzer.instance) {
      ActionAnalyzer.instance = new ActionAnalyzer();
    }
    return ActionAnalyzer.instance;
  }

  /**
   * Initialize Tauri event listeners
   */
  private async initializeEventListeners(): Promise<void> {
    try {
      await listen("new-frame-analyzed", (event: Event<ParsedScreenContent>) => {
        this.onNewFrameCallbacks.forEach((callback) => callback(event.payload));
      });

      await listen("user-action-detected", (event: Event<any>) => {
        this.onActionDetectedCallbacks.forEach((callback) => callback(event.payload));
      });
    } catch (error) {
      console.error("Failed to initialize event listeners:", error);
    }
  }

  /**
   * Start recording and analyzing user actions
   */
  public async startRecording(): Promise<boolean> {
    try {
      const response = await invoke("start_recording");
      const verification = await invoke("verify_recording");
      console.log("Recording started:", response);
      console.log("Recording verified:", verification);
      this.isRecording = true;
      return true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      return false;
    }
  }

  /**
   * Stop recording user actions
   */
  public async stopRecording(encryptionPassword = "applebear"): Promise<boolean> {
    try {
      const response = await invoke("stop_recording", { encryptionPassword });
      console.log("Recording stopped:", response);
      this.isRecording = false;
      return true;
    } catch (error) {
      console.error("Failed to stop recording:", error);
      return false;
    }
  }

  /**
   * Check if recording is active
   */
  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Retrieve the latest frame from the backend
   */
  public async getLatestFrame(): Promise<string> {
    try {
      return await invoke("get_latest_frame");
    } catch (error) {
      console.error("Failed to get latest frame:", error);
      return "";
    }
  }

  /**
   * Get current parsed screen content
   */
  public async getCurrentScreenContent(): Promise<ParsedScreenContent | null> {
    try {
      const rawData = await invoke("get_current_screen_content");
      return JSON.parse(rawData as string) as ParsedScreenContent;
    } catch (error) {
      console.error("Failed to get current screen content:", error);
      return null;
    }
  }

  /**
   * Get action suggestions based on the current screen content
   */
  public async getSuggestions(): Promise<ActionSuggestion[]> {
    try {
      const rawData = await invoke("get_action_suggestions");
      return JSON.parse(rawData as string) as ActionSuggestion[];
    } catch (error) {
      console.error("Failed to get action suggestions:", error);
      return [];
    }
  }

  /**
   * Get detected action patterns for the user
   */
  public async getActionPatterns(): Promise<ActionPattern[]> {
    try {
      const rawData = await invoke("get_action_patterns");
      return JSON.parse(rawData as string) as ActionPattern[];
    } catch (error) {
      console.error("Failed to get action patterns:", error);
      return [];
    }
  }

  /**
   * Register callback for when a new frame is analyzed
   */
  public onNewFrame(callback: (content: ParsedScreenContent) => void): () => void {
    this.onNewFrameCallbacks.push(callback);
    return () => {
      this.onNewFrameCallbacks = this.onNewFrameCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for when a user action is detected
   */
  public onActionDetected(callback: (action: any) => void): () => void {
    this.onActionDetectedCallbacks.push(callback);
    return () => {
      this.onActionDetectedCallbacks = this.onActionDetectedCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Retrieve the action history for a specific timeframe
   */
  public async getActionHistory(
    startTime: number,
    endTime: number,
    limit = 50
  ): Promise<any[]> {
    try {
      const rawData = await invoke("get_action_history", { startTime, endTime, limit });
      return JSON.parse(rawData as string);
    } catch (error) {
      console.error("Failed to get action history:", error);
      return [];
    }
  }
}

// Export a singleton instance
export const actionAnalyzer = ActionAnalyzer.getInstance();