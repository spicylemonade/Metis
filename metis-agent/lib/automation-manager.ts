// metis-agent/lib/automation-manager.ts
import { invoke } from "@tauri-apps/api/core";
import { Event, listen } from "@tauri-apps/api/event";

export interface AutomationTrigger {
  type: "ui_element" | "time" | "event" | "command";
  conditions: any;
}

export interface AutomationAction {
  type: string;
  params: any;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastRun?: number;
  runCount: number;
}

export interface AutomationSuggestion {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  similarity: number; // 0-100
  confidence: number; // 0-100
}

/**
 * Service for managing automations
 */
export class AutomationManager {
  private static instance: AutomationManager;
  private onAutomationRunCallbacks: Array<(automationId: string, success: boolean) => void> = [];
  private onSuggestionAddedCallbacks: Array<(suggestion: AutomationSuggestion) => void> = [];

  private constructor() {
    this.initializeEventListeners();
  }

  /**
   * Get singleton instance of AutomationManager
   */
  public static getInstance(): AutomationManager {
    if (!AutomationManager.instance) {
      AutomationManager.instance = new AutomationManager();
    }
    return AutomationManager.instance;
  }

  /**
   * Initialize Tauri event listeners
   */
  private async initializeEventListeners(): Promise<void> {
    try {
      await listen("automation-run", (event: Event<{ id: string; success: boolean }>) => {
        this.onAutomationRunCallbacks.forEach((callback) => 
          callback(event.payload.id, event.payload.success)
        );
      });

      await listen("automation-suggestion-added", (event: Event<AutomationSuggestion>) => {
        this.onSuggestionAddedCallbacks.forEach((callback) => callback(event.payload));
      });
    } catch (error) {
      console.error("Failed to initialize event listeners:", error);
    }
  }

  /**
   * Get all automations
   */
  public async getAutomations(): Promise<Automation[]> {
    try {
      const rawData = await invoke("get_automations");
      return JSON.parse(rawData as string) as Automation[];
    } catch (error) {
      console.error("Failed to get automations:", error);
      return [];
    }
  }

  /**
   * Get active automations
   */
  public async getActiveAutomations(): Promise<Automation[]> {
    try {
      const rawData = await invoke("get_active_automations");
      return JSON.parse(rawData as string) as Automation[];
    } catch (error) {
      console.error("Failed to get active automations:", error);
      return [];
    }
  }

  /**
   * Get automation suggestions
   */
  public async getAutomationSuggestions(): Promise<AutomationSuggestion[]> {
    try {
      const rawData = await invoke("get_automation_suggestions");
      return JSON.parse(rawData as string) as AutomationSuggestion[];
    } catch (error) {
      console.error("Failed to get automation suggestions:", error);
      return [];
    }
  }

  /**
   * Create a new automation
   */
  public async createAutomation(automation: Omit<Automation, "id" | "createdAt" | "updatedAt" | "runCount">): Promise<string | null> {
    try {
      return await invoke("create_automation", { automation });
    } catch (error) {
      console.error("Failed to create automation:", error);
      return null;
    }
  }

  /**
   * Update an existing automation
   */
  public async updateAutomation(id: string, automation: Partial<Automation>): Promise<boolean> {
    try {
      return await invoke("update_automation", { id, automation });
    } catch (error) {
      console.error("Failed to update automation:", error);
      return false;
    }
  }

  /**
   * Delete an automation
   */
  public async deleteAutomation(id: string): Promise<boolean> {
    try {
      return await invoke("delete_automation", { id });
    } catch (error) {
      console.error("Failed to delete automation:", error);
      return false;
    }
  }

  /**
   * Enable or disable an automation
   */
  public async setAutomationActive(id: string, active: boolean): Promise<boolean> {
    try {
      return await invoke("set_automation_active", { id, active });
    } catch (error) {
      console.error("Failed to set automation active state:", error);
      return false;
    }
  }

  /**
   * Run an automation manually
   */
  public async runAutomation(id: string): Promise<boolean> {
    try {
      return await invoke("run_automation", { id });
    } catch (error) {
      console.error("Failed to run automation:", error);
      return false;
    }
  }

  /**
   * Approve an automation suggestion
   */
  public async approveAutomationSuggestion(suggestion: AutomationSuggestion): Promise<string | null> {
    try {
      return await invoke("approve_automation_suggestion", { suggestion });
    } catch (error) {
      console.error("Failed to approve automation suggestion:", error);
      return null;
    }
  }

  /**
   * Register callback for when an automation runs
   */
  public onAutomationRun(callback: (automationId: string, success: boolean) => void): () => void {
    this.onAutomationRunCallbacks.push(callback);
    return () => {
      this.onAutomationRunCallbacks = this.onAutomationRunCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Register callback for when a new automation suggestion is added
   */
  public onSuggestionAdded(callback: (suggestion: AutomationSuggestion) => void): () => void {
    this.onSuggestionAddedCallbacks.push(callback);
    return () => {
      this.onSuggestionAddedCallbacks = this.onSuggestionAddedCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }
}

// Export a singleton instance
export const automationManager = AutomationManager.getInstance();