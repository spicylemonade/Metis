// metis-agent/lib/skill-manager.ts
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  downloads: number;
  rating: number;
}

export interface SkillBundle {
  id: string;
  name: string;
  description: string;
  skills: Skill[];
  tags: string[]; // Added this property
  author: string;
  version: string;
  thumbnailUrl?: string;
  createdAt: number;
  updatedAt: number;
  downloads: number;
  rating: number;
}

export interface SkillLearningProgress {
  skillId: string;
  progress: number; // 0-100
  status: "not_started" | "in_progress" | "completed";
  lastUpdated: number;
}

/**
 * Service for managing skills and skill bundles
 */
export class SkillManager {
  private static instance: SkillManager;

  private constructor() {}

  /**
   * Get singleton instance of SkillManager
   */
  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * Get installed skills
   */
  public async getInstalledSkills(): Promise<Skill[]> {
    try {
      const rawData = await invoke("get_installed_skills");
      return JSON.parse(rawData as string) as Skill[];
    } catch (error) {
      console.error("Failed to get installed skills:", error);
      return [];
    }
  }

  /**
   * Get skill bundles from marketplace
   */
  public async getMarketplaceSkillBundles(page = 1, limit = 10): Promise<SkillBundle[]> {
    try {
      const rawData = await invoke("get_marketplace_skill_bundles", { page, limit });
      return JSON.parse(rawData as string) as SkillBundle[];
    } catch (error) {
      console.error("Failed to get marketplace skill bundles:", error);
      return [];
    }
  }

  /**
   * Search skill bundles in marketplace
   */
  public async searchMarketplace(query: string, tags?: string[]): Promise<SkillBundle[]> {
    try {
      const rawData = await invoke("search_marketplace", { query, tags });
      return JSON.parse(rawData as string) as SkillBundle[];
    } catch (error) {
      console.error("Failed to search marketplace:", error);
      return [];
    }
  }

  /**
   * Install a skill bundle from marketplace
   */
  public async installSkillBundle(bundleId: string): Promise<boolean> {
    try {
      return await invoke("install_skill_bundle", { bundleId });
    } catch (error) {
      console.error("Failed to install skill bundle:", error);
      return false;
    }
  }

  /**
   * Uninstall a skill bundle
   */
  public async uninstallSkillBundle(bundleId: string): Promise<boolean> {
    try {
      return await invoke("uninstall_skill_bundle", { bundleId });
    } catch (error) {
      console.error("Failed to uninstall skill bundle:", error);
      return false;
    }
  }

  /**
   * Upload a video to learn new skills
   */
  public async uploadLearningVideo(): Promise<boolean> {
    try {
      // Open file selection dialog
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Videos",
            extensions: ["mp4", "webm", "mov", "avi"]
          }
        ]
      });

      if (!selected || Array.isArray(selected)) {
        return false;
      }

      // Read the file
      const filePath = selected;
      
      // Call Tauri command to process the file
      return await invoke("process_learning_video", { filePath });
    } catch (error) {
      console.error("Failed to upload learning video:", error);
      return false;
    }
  }

  /**
   * Get learning progress for all skills
   */
  public async getLearningProgress(): Promise<SkillLearningProgress[]> {
    try {
      const rawData = await invoke("get_learning_progress");
      return JSON.parse(rawData as string) as SkillLearningProgress[];
    } catch (error) {
      console.error("Failed to get learning progress:", error);
      return [];
    }
  }

  /**
   * Create and share a new skill bundle
   */
  public async createAndShareSkillBundle(
    name: string,
    description: string,
    skillIds: string[],
    isPublic = false
  ): Promise<string | null> {
    try {
      return await invoke("create_skill_bundle", {
        name,
        description,
        skillIds,
        isPublic
      });
    } catch (error) {
      console.error("Failed to create skill bundle:", error);
      return null;
    }
  }
}

// Export a singleton instance
export const skillManager = SkillManager.getInstance();