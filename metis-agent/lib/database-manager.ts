// metis-agent/lib/database-manager.ts
import { invoke } from "@tauri-apps/api/core";

/**
 * DatabaseManager provides a client for interacting with the local SQLite database
 * It encapsulates all database operations and provides typed interfaces for data
 */
export class DatabaseManager {
  private static instance: DatabaseManager;

  private constructor() {}

  /**
   * Get singleton instance of DatabaseManager
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize the database and ensure all required tables exist
   */
  public async initialize(): Promise<boolean> {
    try {
      await invoke("initialize_database");
      return true;
    } catch (error) {
      console.error("Failed to initialize database:", error);
      return false;
    }
  }

  /**
   * Execute a raw SQL query (for advanced usage)
   */
  public async executeQuery(query: string, params: any[] = []): Promise<any> {
    try {
      return await invoke("execute_query", { query, params });
    } catch (error) {
      console.error("Failed to execute query:", error);
      throw error;
    }
  }

  /**
   * Get all records from a table
   */
  public async getAll(table: string): Promise<any[]> {
    try {
      return await invoke("get_all", { table });
    } catch (error) {
      console.error(`Failed to get all records from ${table}:`, error);
      return [];
    }
  }

  /**
   * Get a record by ID
   */
  public async getById(table: string, id: string): Promise<any | null> {
    try {
      return await invoke("get_by_id", { table, id });
    } catch (error) {
      console.error(`Failed to get record from ${table}:`, error);
      return null;
    }
  }

  /**
   * Insert a new record
   */
  public async insert(table: string, data: any): Promise<string | null> {
    try {
      return await invoke("insert_record", { table, data });
    } catch (error) {
      console.error(`Failed to insert record into ${table}:`, error);
      return null;
    }
  }

  /**
   * Update a record
   */
  public async update(table: string, id: string, data: any): Promise<boolean> {
    try {
      return await invoke("update_record", { table, id, data });
    } catch (error) {
      console.error(`Failed to update record in ${table}:`, error);
      return false;
    }
  }

  /**
   * Delete a record
   */
  public async delete(table: string, id: string): Promise<boolean> {
    try {
      return await invoke("delete_record", { table, id });
    } catch (error) {
      console.error(`Failed to delete record from ${table}:`, error);
      return false;
    }
  }

  /**
   * Query records with a filter
   */
  public async query(table: string, filter: Record<string, any>): Promise<any[]> {
    try {
      return await invoke("query_records", { table, filter });
    } catch (error) {
      console.error(`Failed to query records from ${table}:`, error);
      return [];
    }
  }

  /**
   * Create a backup of the database
   */
  public async createBackup(path?: string): Promise<string | null> {
    try {
      return await invoke("create_backup", { path });
    } catch (error) {
      console.error("Failed to create database backup:", error);
      return null;
    }
  }

  /**
   * Restore the database from a backup
   */
  public async restoreFromBackup(path: string): Promise<boolean> {
    try {
      return await invoke("restore_backup", { path });
    } catch (error) {
      console.error("Failed to restore database from backup:", error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<{ 
    size: number; 
    tables: { name: string; rows: number }[]; 
    lastModified: string 
  }> {
    try {
      return await invoke("get_database_stats");
    } catch (error) {
      console.error("Failed to get database stats:", error);
      return { size: 0, tables: [], lastModified: "" };
    }
  }

  /**
   * Begin a transaction
   */
  public async beginTransaction(): Promise<boolean> {
    try {
      return await invoke("begin_transaction");
    } catch (error) {
      console.error("Failed to begin transaction:", error);
      return false;
    }
  }

  /**
   * Commit a transaction
   */
  public async commitTransaction(): Promise<boolean> {
    try {
      return await invoke("commit_transaction");
    } catch (error) {
      console.error("Failed to commit transaction:", error);
      return false;
    }
  }

  /**
   * Rollback a transaction
   */
  public async rollbackTransaction(): Promise<boolean> {
    try {
      return await invoke("rollback_transaction");
    } catch (error) {
      console.error("Failed to rollback transaction:", error);
      return false;
    }
  }
}

// Export a singleton instance
export const databaseManager = DatabaseManager.getInstance();