// src-tauri/src/skill_commands.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime, State};
use std::sync::Mutex;

// Define Skill Types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub author: String,
    pub version: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub thumbnail_url: Option<String>,
    pub downloads: u32,
    pub rating: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillBundle {
    pub id: String,
    pub name: String,
    pub description: String,
    pub skills: Vec<Skill>,
    pub tags: Vec<String>,
    pub author: String,
    pub version: String,
    pub thumbnail_url: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub downloads: u32,
    pub rating: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillLearningProgress {
    pub skill_id: String,
    pub progress: u32,
    pub status: String,
    pub last_updated: u64,
}

// Skill Database (in-memory for this example)
pub struct SkillStore {
    pub installed_skills: Mutex<Vec<Skill>>,
    pub marketplace_bundles: Mutex<Vec<SkillBundle>>,
    pub learning_progress: Mutex<Vec<SkillLearningProgress>>,
}

impl SkillStore {
    pub fn new() -> Self {
        // Create some sample data
        let installed_skills = vec![
            Skill {
                id: "skill1".to_string(),
                name: "Web Navigation".to_string(),
                description: "Skills for navigating web interfaces".to_string(),
                tags: vec!["web".to_string(), "browser".to_string()],
                author: "Metis".to_string(),
                version: "1.0.0".to_string(),
                created_at: 1708617600000, // Example timestamp
                updated_at: 1708617600000,
                thumbnail_url: None,
                downloads: 1250,
                rating: 4.7,
            },
            Skill {
                id: "skill2".to_string(),
                name: "Form Filling".to_string(),
                description: "Automatically fill out web forms".to_string(),
                tags: vec!["web".to_string(), "forms".to_string(), "automation".to_string()],
                author: "Metis".to_string(),
                version: "1.0.0".to_string(),
                created_at: 1708704000000, // Example timestamp
                updated_at: 1708704000000,
                thumbnail_url: None,
                downloads: 980,
                rating: 4.5,
            },
        ];

        let marketplace_bundles = vec![
            SkillBundle {
                id: "bundle1".to_string(),
                name: "Web Productivity Suite".to_string(),
                description: "Complete set of skills for web productivity".to_string(),
                skills: installed_skills.clone(),
                tags: vec!["productivity".to_string(), "web".to_string()],
                author: "Metis".to_string(),
                version: "1.0.0".to_string(),
                created_at: 1708617600000,
                updated_at: 1708617600000,
                thumbnail_url: None,
                downloads: 3200,
                rating: 4.8,
            },
            SkillBundle {
                id: "bundle2".to_string(),
                name: "Design Tools Automation".to_string(),
                description: "Skills for automating common design tool operations".to_string(),
                skills: vec![],
                tags: vec!["design".to_string(), "creative".to_string()],
                author: "CreativeBot".to_string(),
                version: "1.1.0".to_string(),
                created_at: 1708704000000,
                updated_at: 1708704000000,
                thumbnail_url: None,
                downloads: 1800,
                rating: 4.6,
            },
            SkillBundle {
                id: "bundle3".to_string(),
                name: "Code Editor Assistant".to_string(),
                description: "Automation skills for common code editor tasks".to_string(),
                skills: vec![],
                tags: vec!["development".to_string(), "coding".to_string()],
                author: "DevTools Inc.".to_string(),
                version: "2.0.0".to_string(),
                created_at: 1708790400000,
                updated_at: 1708790400000,
                thumbnail_url: None,
                downloads: 2500,
                rating: 4.9,
            },
        ];

        let learning_progress = vec![
            SkillLearningProgress {
                skill_id: "skill1".to_string(),
                progress: 75,
                status: "in_progress".to_string(),
                last_updated: 1708876800000,
            },
            SkillLearningProgress {
                skill_id: "skill2".to_string(),
                progress: 30,
                status: "in_progress".to_string(),
                last_updated: 1708876800000,
            },
        ];

        Self {
            installed_skills: Mutex::new(installed_skills),
            marketplace_bundles: Mutex::new(marketplace_bundles),
            learning_progress: Mutex::new(learning_progress),
        }
    }

    // Function to load data from disk (placeholder for real implementation)
    pub fn load_from_disk(&self, app_handle: &AppHandle) -> Result<(), String> {
        // In a real implementation, this would load data from a file
        // For now, we're just using the sample data initialized in new()
        Ok(())
    }

    // Function to save data to disk (placeholder for real implementation)
    pub fn save_to_disk(&self, app_handle: &AppHandle) -> Result<(), String> {
        // In a real implementation, this would save data to a file
        Ok(())
    }
}

// Command handlers

/// Get installed skills
#[tauri::command]
pub fn get_installed_skills(skill_store: State<'_, SkillStore>) -> Result<Vec<Skill>, String> {
    match skill_store.installed_skills.lock() {
        Ok(skills) => Ok(skills.clone()),
        Err(_) => Err("Failed to access installed skills".into()),
    }
}

/// Get skill bundles from marketplace
#[tauri::command]
pub fn get_marketplace_skill_bundles(
    page: Option<u32>, 
    limit: Option<u32>, 
    skill_store: State<'_, SkillStore>
) -> Result<Vec<SkillBundle>, String> {
    match skill_store.marketplace_bundles.lock() {
        Ok(bundles) => {
            let page = page.unwrap_or(1);
            let limit = limit.unwrap_or(10);
            let start = ((page - 1) * limit) as usize;
            let end = (page * limit) as usize;
            
            Ok(bundles
                .iter()
                .skip(start)
                .take(end - start)
                .cloned()
                .collect())
        },
        Err(_) => Err("Failed to access marketplace bundles".into()),
    }
}

/// Search marketplace for skill bundles
#[tauri::command]
pub fn search_marketplace(
    query: String, 
    tags: Option<Vec<String>>, 
    skill_store: State<'_, SkillStore>
) -> Result<Vec<SkillBundle>, String> {
    match skill_store.marketplace_bundles.lock() {
        Ok(bundles) => {
            let query = query.to_lowercase();
            let filtered = bundles
                .iter()
                .filter(|bundle| {
                    // Filter by query
                    let query_match = bundle.name.to_lowercase().contains(&query) || 
                                     bundle.description.to_lowercase().contains(&query);
                    
                    // Filter by tags if provided
                    let tags_match = if let Some(tag_filters) = &tags {
                        tag_filters.iter().any(|tag| {
                            bundle.tags.iter().any(|bundle_tag| {
                                bundle_tag.to_lowercase().contains(&tag.to_lowercase())
                            })
                        })
                    } else {
                        true
                    };
                    
                    query_match && tags_match
                })
                .cloned()
                .collect();
            
            Ok(filtered)
        },
        Err(_) => Err("Failed to access marketplace bundles".into()),
    }
}

/// Install a skill bundle
#[tauri::command]
pub fn install_skill_bundle(
    bundle_id: String, 
    skill_store: State<'_, SkillStore>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    // Find the bundle
    let bundle = {
        let bundles = skill_store.marketplace_bundles.lock()
            .map_err(|_| "Failed to access marketplace bundles".to_string())?;
            
        bundles.iter()
            .find(|b| b.id == bundle_id)
            .cloned()
    };
    
    if let Some(bundle) = bundle {
        // Add the skills from the bundle to installed skills
        let mut installed_skills = skill_store.installed_skills.lock()
            .map_err(|_| "Failed to access installed skills".to_string())?;
        
        for skill in &bundle.skills {
            // Check if skill is already installed
            if !installed_skills.iter().any(|s| s.id == skill.id) {
                installed_skills.push(skill.clone());
            }
        }
        
        // Save changes to disk
        skill_store.save_to_disk(&app_handle)?;
        
        Ok(true)
    } else {
        Err("Bundle not found".into())
    }
}

/// Get learning progress for skills
#[tauri::command]
pub fn get_learning_progress(skill_store: State<'_, SkillStore>) -> Result<Vec<SkillLearningProgress>, String> {
    match skill_store.learning_progress.lock() {
        Ok(progress) => Ok(progress.clone()),
        Err(_) => Err("Failed to access learning progress".into()),
    }
}

/// Process a learning video
#[tauri::command]
pub fn process_learning_video(
    file_path: String, 
    skill_store: State<'_, SkillStore>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    // In a real implementation, this would process the video file and extract skills
    // For now, we'll just add some fake progress
    
    let mut progress = skill_store.learning_progress.lock()
        .map_err(|_| "Failed to access learning progress".to_string())?;
    
    // Update progress for existing skills
    for item in progress.iter_mut() {
        // Increment progress by 10%, capped at 100%
        item.progress = std::cmp::min(item.progress + 10, 100);
        item.last_updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64;
    }
    
    // Save changes to disk
    skill_store.save_to_disk(&app_handle)?;
    
    Ok(true)
}

/// Uninstall a skill bundle
#[tauri::command]
pub fn uninstall_skill_bundle(
    bundle_id: String, 
    skill_store: State<'_, SkillStore>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    // Find the bundle
    let bundle = {
        let bundles = skill_store.marketplace_bundles.lock()
            .map_err(|_| "Failed to access marketplace bundles".to_string())?;
            
        bundles.iter()
            .find(|b| b.id == bundle_id)
            .cloned()
    };
    
    if let Some(bundle) = bundle {
        // Remove the skills from the bundle from installed skills
        let mut installed_skills = skill_store.installed_skills.lock()
            .map_err(|_| "Failed to access installed skills".to_string())?;
        
        installed_skills.retain(|skill| {
            !bundle.skills.iter().any(|bundle_skill| bundle_skill.id == skill.id)
        });
        
        // Save changes to disk
        skill_store.save_to_disk(&app_handle)?;
        
        Ok(true)
    } else {
        Err("Bundle not found".into())
    }
}

/// Create and share a new skill bundle
#[tauri::command]
pub fn create_skill_bundle(
    name: String,
    description: String,
    skill_ids: Vec<String>,
    is_public: Option<bool>,
    skill_store: State<'_, SkillStore>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let is_public = is_public.unwrap_or(false);
    
    // Get the skills
    let skills = {
        let installed_skills = skill_store.installed_skills.lock()
            .map_err(|_| "Failed to access installed skills".to_string())?;
            
        installed_skills.iter()
            .filter(|skill| skill_ids.contains(&skill.id))
            .cloned()
            .collect::<Vec<Skill>>()
    };
    
    if skills.is_empty() {
        return Err("No valid skills found".into());
    }
    
    // Create a new bundle
    let bundle_id = format!("bundle_{}", rand::random::<u32>());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    
    let tags = vec!["custom".to_string()];
    
    let new_bundle = SkillBundle {
        id: bundle_id.clone(),
        name,
        description,
        skills,
        tags,
        author: "User".to_string(), // Could be replaced with actual user info
        version: "1.0.0".to_string(),
        created_at: now,
        updated_at: now,
        thumbnail_url: None,
        downloads: 0,
        rating: 5.0, // Default rating
    };
    
    // Add to marketplace if public
    if is_public {
        let mut marketplace = skill_store.marketplace_bundles.lock()
            .map_err(|_| "Failed to access marketplace bundles".to_string())?;
        
        marketplace.push(new_bundle);
    }
    
    // Save changes to disk
    skill_store.save_to_disk(&app_handle)?;
    
    Ok(bundle_id)
}