// metis-agent/lib/action-executor.ts
import { invoke } from "@tauri-apps/api/core";

interface ActionExecutorOptions {
  useEncryption?: boolean;
  dryRun?: boolean;
}

/**
 * Service for executing automation actions through Tauri commands
 */
export class ActionExecutor {
  private static instance: ActionExecutor;
  private executionQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private options: ActionExecutorOptions = {
    useEncryption: true,
    dryRun: false,
  };

  private constructor() {}

  /**
   * Get singleton instance of ActionExecutor
   */
  public static getInstance(): ActionExecutor {
    if (!ActionExecutor.instance) {
      ActionExecutor.instance = new ActionExecutor();
    }
    return ActionExecutor.instance;
  }

  /**
   * Configure the executor options
   */
  public configure(options: ActionExecutorOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Execute a mouse click at specific coordinates
   */
  public async click(x: number, y: number): Promise<boolean> {
    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would click at coordinates (${x}, ${y})`);
      return true;
    }

    try {
      return await invoke("execute_mouse_click", { x, y });
    } catch (error) {
      console.error("Failed to execute click:", error);
      return false;
    }
  }

  /**
   * Execute a keyboard input sequence
   */
  public async type(text: string): Promise<boolean> {
    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would type: "${text}"`);
      return true;
    }

    try {
      return await invoke("execute_keyboard_input", { text });
    } catch (error) {
      console.error("Failed to execute keyboard input:", error);
      return false;
    }
  }

  /**
   * Execute a scrolling action
   */
  public async scroll(direction: "up" | "down", amount: number): Promise<boolean> {
    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would scroll ${direction} by ${amount}`);
      return true;
    }

    try {
      return await invoke("execute_scroll", { direction, amount });
    } catch (error) {
      console.error("Failed to execute scroll:", error);
      return false;
    }
  }

  /**
   * Execute drag and drop operation
   */
  public async dragAndDrop(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<boolean> {
    if (this.options.dryRun) {
      console.log(
        `[DRY RUN] Would drag from (${startX}, ${startY}) to (${endX}, ${endY})`
      );
      return true;
    }

    try {
      return await invoke("execute_drag_and_drop", {
        startX,
        startY,
        endX,
        endY,
      });
    } catch (error) {
      console.error("Failed to execute drag and drop:", error);
      return false;
    }
  }

  /**
   * Execute a sequence of actions
   */
  public async executeSequence(actions: Array<{ type: string; params: any }>): Promise<boolean[]> {
    return Promise.all(
      actions.map(async (action) => {
        switch (action.type) {
          case "click":
            return this.click(action.params.x, action.params.y);
          case "type":
            return this.type(action.params.text);
          case "scroll":
            return this.scroll(action.params.direction, action.params.amount);
          case "dragAndDrop":
            return this.dragAndDrop(
              action.params.startX,
              action.params.startY,
              action.params.endX,
              action.params.endY
            );
          default:
            console.warn(`Unknown action type: ${action.type}`);
            return false;
        }
      })
    );
  }

  /**
   * Queue an action for execution (helps prevent action collision)
   */
  public async queueAction<T>(
    actionFn: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.executionQueue.push(async () => {
        try {
          const result = await actionFn();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      });
      
      this.processQueue();
    });
  }

  /**
   * Process the queued actions in order
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      while (this.executionQueue.length > 0) {
        const action = this.executionQueue.shift();
        if (action) {
          await action();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

// Export a singleton instance
export const actionExecutor = ActionExecutor.getInstance();