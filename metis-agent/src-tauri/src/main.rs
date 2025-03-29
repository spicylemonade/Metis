#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
/*
Input Metrics Logic (now handled in the single global listener):
- Simple Clicking: On a mouse button press, take one screenshot 0.5 second after the press. (Adjusted timing from original comment)
- Click and Drag: Requires tracking mouse press/release state. Screenshot logic tied to ButtonPress/Release.
- Keyboard Typing:
   • If fewer than 4 keys are pressed within 2 seconds, take a screenshot 1 second after a key press (if > 1s idle).
   • If more than 3 keys are pressed in under 2 seconds, only take one after 1 second of no typing.
- Mouse Movement (without a click) does not trigger a screenshot.
*/

mod llm;
mod action;

#[cfg(target_os = "linux")]
use x11::xlib;
use std::{
    io::Cursor,
    path::{Path, PathBuf},
    sync::{Arc, Mutex}, // Added Arc
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
    fs, // Added fs
};
use std::collections::VecDeque;
// Removed VecDeque as it seems unused
use once_cell::sync::Lazy;
use dirs::download_dir;
use tauri;
use rdev::{listen, Event, EventType, Key}; // Added Key, Event
use image::{ImageError, ImageOutputFormat}; // Removed DynamicImage as capture_screen returns it directly
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use enigo::{Enigo, Mouse, Settings}; // Keep Enigo parts used by mouse tracker
use xcap::Monitor;
use csv::{ReaderBuilder, WriterBuilder, StringRecord}; // Keep CSV helpers
use regex::Regex; // Keep Regex
use reqwest::blocking::Client; // Keep reqwest
use serde_json::json; // Keep serde_json

// --- Shared Application State Management ---

#[derive(Debug, Clone, PartialEq)]
pub enum AppInputState {
    Idle,
    Recording,
    ExecutingAction,
}

// Holds state relevant across the entire application lifecycle
pub struct GlobalAppState {
    pub input_state: AppInputState,
    pub action_interrupted: bool, // Flag specifically for interrupting execute_task_loop via ESC
    // Add other globally relevant state if needed later
}

impl Default for GlobalAppState {
    fn default() -> Self {
        GlobalAppState {
            input_state: AppInputState::Idle,
            action_interrupted: false,
        }
    }
}

// Thread-safe global state
// Encapsulated in Arc<Mutex<...>> for safe sharing across threads
pub static GLOBAL_APP_STATE: Lazy<Arc<Mutex<GlobalAppState>>> =
    Lazy::new(|| Arc::new(Mutex::new(GlobalAppState::default())));

// --- Recording Specific State ---
// Kept separate for fields only relevant during active recording periods
#[derive(Default)]
pub struct RecordingState {
    active: bool, // Is recording logically active?
    verified: bool, // Has verification step been done?
    base_folder: Option<String>, // Where are we saving this recording session?
    current_action_folder: Option<String>, // Name of the subfolder (e.g., "action_0")
    mouse_location: Option<(i32, i32)>, // Last known mouse location
    // --- Input Metrics Tracking ---
    last_mouse_press_time: Option<SystemTime>, // When was mouse last pressed?
    is_mouse_button_down: bool, // Is a button currently held? (Simplified)
    recent_key_press_times: VecDeque<SystemTime>, // Track timestamps of recent key presses
    // Limit the queue size, e.g., track last 10 presses
    // last_keyboard_activity: SystemTime, // When was the last key press/release?
    // pending_keyboard_screenshot: Option<tokio::task::JoinHandle<()>>, // Handle for cancellable screenshot task
    // --- End Input Metrics Tracking ---
}

// Separate state for recording details
pub static RECORDING_STATE: Lazy<Mutex<RecordingState>> =
    Lazy::new(|| Mutex::new(RecordingState::default()));
static LATEST_FRAME: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
#[tauri::command]
fn start_recording() -> Result<String, String> {
    println!("Start recording command received.");
    // Ensure we are not already recording or executing
    {
        let mut app_state = GLOBAL_APP_STATE.lock().unwrap();
        if app_state.input_state != AppInputState::Idle {
            return Err(format!("Cannot start recording while in state: {:?}", app_state.input_state));
        }
        // Set global state first
        app_state.input_state = AppInputState::Recording;
    }

    let base_folder = get_default_base_folder();
    let base_folder_str = base_folder.to_string_lossy().into_owned(); // Convert early
    let (_, _, encrypted_dir, _) = create_recording_paths(&base_folder_str)
        .map_err(|e| format!("Failed to create recording paths: {}", e))?;

    let mut action_index = 0;
    loop {
        let action_folder = encrypted_dir.join(format!("action_{}", action_index));
        if !action_folder.exists() {
            fs::create_dir_all(&action_folder).map_err(|e| format!("Failed to create action folder: {}", e))?;
            break;
        }
        action_index += 1;
        if action_index > 10000 { // Safety break
            return Err("Failed to find next available action folder index.".to_string());
        }
    }
    let action_folder_name = format!("action_{}", action_index);

    // Create or update main.csv (ensure action::create_main_csv is accessible)
    action::create_main_csv(&base_folder, &action_folder_name)
        .map_err(|e| format!("Failed to update main.csv: {}", e))?;

    // Update recording-specific state
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = true;
        state.verified = false; // Requires explicit verification step
        state.base_folder = Some(base_folder_str.clone());
        state.current_action_folder = Some(action_folder_name.clone());
        // Reset metrics
        state.mouse_location = None;
        state.last_mouse_press_time = None;
        state.is_mouse_button_down = false;
        state.recent_key_press_times = VecDeque::with_capacity(10); // Reset key history
    }

    // --- Start the separate mouse tracker thread ---
    start_mouse_location_tracker();
    // --- Removed spawning start_input_listeners; single global listener handles it ---

    Ok(format!("Recording started (Action Folder: {})", action_folder_name))
}

#[tauri::command]
fn verify_recording() -> Result<String, String> {
    println!("Verify recording command received.");
    let base_folder: String;
    { // Scope for locks
        let app_state = GLOBAL_APP_STATE.lock().unwrap();
        if app_state.input_state != AppInputState::Recording {
            return Err("Cannot verify, not in Recording state.".to_string());
        }

        let mut rec_state = RECORDING_STATE.lock().unwrap();
        if !rec_state.active {
            return Err("Recording is not active (internal state mismatch).".into());
        }
        if rec_state.verified {
            return Ok("Recording already verified.".into()); // Idempotent
        }
        rec_state.verified = true;
        base_folder = rec_state.base_folder.clone().ok_or("Base folder not set during verification.")?;
        // Capture current mouse position at verification time for the "Init" screenshot
        let mouse_pos = rec_state.mouse_location; // Read current value

        // Spawn screenshot thread
        thread::spawn(move || {
            println!("Capturing initial screenshot after verification...");
            // Short delay before capturing?
            // thread::sleep(Duration::from_millis(100));
            if let Err(e) = capture_and_save_screenshot_with_action(&base_folder, "Init", mouse_pos) {
                eprintln!("Error capturing initial screenshot: {}", e);
            }
        });
    } // Locks released
    Ok("Recording verified. Input events will now trigger screenshots.".into())
}

#[tauri::command]
fn stop_recording(encryption_password: String) -> Result<String, String> {
    println!("Stop recording command received.");
    let base_folder: String;
    { // Scope for locks
        // Set global state first
        let mut app_state = GLOBAL_APP_STATE.lock().unwrap();
        if app_state.input_state != AppInputState::Recording {
            // Allow stopping even if not recording? Or return error?
            // Let's allow stopping to ensure state cleanup.
            println!("Warning: Stop recording called while not in Recording state ({:?}). Forcing state to Idle.", app_state.input_state);
        }
        app_state.input_state = AppInputState::Idle; // Go back to Idle

        // Update recording-specific state
        let mut rec_state = RECORDING_STATE.lock().unwrap();
        if !rec_state.active {
            return Ok("Recording was already inactive.".to_string()); // Idempotent
        }
        rec_state.active = false; // Mark recording inactive (stops mouse tracker loop)
        rec_state.verified = false; // Reset verification
        base_folder = rec_state.base_folder.clone().ok_or("Base folder was not set.")?;
    } // Locks released

    // Spawn the background processing thread
    let base_folder_clone = base_folder.clone(); // Clone for thread
    thread::spawn(move || {
        println!("Starting background processing thread...");
        match process_recording_internal(&base_folder_clone, encryption_password) { // Pass clone
            Ok(_results) => { // Use _results to silence warning
                // println!("Processing Results: {:?}", _results); // Optionally log results
                println!("Background processing complete.");
            },
            Err(e) => eprintln!("Error during background processing: {}", e),
        }
    });

    Ok("Recording stopped. Processing in background.".to_string())
}

#[tauri::command]
fn summarize_recording() -> Result<String, String> {
    println!("Summarize recording command received."); // Good practice to log command entry

    // Determine base folder, falling back to default if not set in state
    // Using unwrap_or_else to ensure we always get a String path
    let base_folder_path_str = {
        RECORDING_STATE.lock().unwrap().base_folder
            .clone()
            .unwrap_or_else(|| get_default_base_folder().to_string_lossy().into_owned())
    };

    // Call the internal function and map the error type
    let summary_result: Result<String, String> = summarize_recording_internal(&base_folder_path_str)
        .map_err(|e| {
            // Optional: Log the original error for better debugging
            eprintln!("Error in summarize_recording_internal: {:?}", e);
            // Convert the Box<dyn Error> to the String required by the function signature
            e.to_string()
        });

    // Directly return the Result<String, String>
    // This matches the function signature `-> Result<String, String>`
    summary_result
}
#[tauri::command]
fn get_latest_frame() -> Result<String, String> {
    // This remains unchanged, reads from LATEST_FRAME
    let frame = LATEST_FRAME.lock().unwrap();
    if let Some(ref data) = *frame {
        Ok(data.clone())
    } else {
        let fallback = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUCNdj+P///38ACfsD/6EXSgAAAABJRU5ErkJggg==";
        Ok(fallback.to_string())
    }
}

// Command to start the action execution loop
#[tauri::command]
fn start_act(command: String) -> Result<String, String> {
    println!("Start action command received: {}", command);
    // Spawn execute_task_loop in a new thread to avoid blocking Tauri
    // execute_task_loop itself will handle setting the GLOBAL_APP_STATE
    match thread::spawn(move || { // Use thread::spawn from std
        action::execute_task_loop(command) // Call the function in action module
    }).join() {
        Ok(result) => result, // Propagate the Result<String, String>
        Err(panic_info) => {
            // Try to get more info from panic
            let payload = panic_info.downcast_ref::<&str>().unwrap_or(&"unknown panic payload");
            eprintln!("Action execution thread panicked: {:?}", payload);
            Err(format!("Action execution thread panicked: {}", payload))
        }
    }
}

// Command to update action name during recording
#[tauri::command]
fn update_current_action_name(name: String) -> Result<(), String> {
    println!("Update action name command received: {}", name);
    if name.trim().is_empty() {
        return Err("Action name cannot be empty.".to_string());
    }
    if name.starts_with("default_") {
        return Err("Action name cannot start with 'default_'.".to_string());
    }

    // Check global state first
    {
        let app_state = GLOBAL_APP_STATE.lock().unwrap();
        if app_state.input_state != AppInputState::Recording {
            return Err(format!("Cannot update name while not in Recording state ({:?})", app_state.input_state));
        }
    }

    // Check recording state and get necessary info
    let (base_folder, current_action_folder) = {
        let state = RECORDING_STATE.lock().unwrap();
        if !state.active { // Double check active flag
            return Err("Recording is not active.".to_string());
        }
        (
            state.base_folder.clone().ok_or("Base folder not set while recording.")?,
            state.current_action_folder.clone().ok_or("Current action folder not set while recording.")?,
        )
    }; // Lock released

    // Call the helper function (ensure it's accessible, maybe move to main.rs?)
    update_main_csv_entry(&base_folder, &current_action_folder, &name)
}

// --- CSV Processing Functions (Moved here from action.rs or kept in main.rs) ---
// --- Utility Functions ---

pub fn get_default_base_folder() -> PathBuf {
    dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("C:\\Downloads")) // Consider platform-specific defaults
        .join("screenshots")
}

fn create_recording_paths(base_folder: &str) -> std::io::Result<(PathBuf, PathBuf, PathBuf, PathBuf)> {
    let base = PathBuf::from(base_folder);
    let images = base.join("images");
    let encrypted = base.join("encrypted_csv");
    let salt = base.join("salt"); // Salt folder seems unused? Keep for now.
    fs::create_dir_all(&images)?;
    fs::create_dir_all(&encrypted)?;
    fs::create_dir_all(&salt)?;
    Ok((base, images, encrypted, salt))
}

/// Captures a screenshot of the primary monitor.
fn capture_screen() -> Result<image::DynamicImage, ImageError> {
    let result = std::panic::catch_unwind(|| {
        let monitors = Monitor::all().map_err(|e| ImageError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to get monitors: {:?}", e),
        )))?;

        if monitors.is_empty() {
            return Err(ImageError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other, "No monitors found",
            )));
        }

        let primary_monitor = &monitors[0];
        let xcap_image = primary_monitor.capture_image().map_err(|e| ImageError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other, format!("Failed to capture image: {:?}", e),
        )))?;

        let width = xcap_image.width();
        let height = xcap_image.height();
        let raw = xcap_image.into_raw(); // Consumes image

        image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, raw)
            .map(image::DynamicImage::ImageRgba8)
            .ok_or_else(|| ImageError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to convert captured image to ImageBuffer",
            )))
    });

    match result {
        Ok(res) => res,
        Err(_) => Err(ImageError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other, "Panic occurred during screen capture",
        ))),
    }
}


/// Captures and saves screenshot, updating the latest frame.
fn capture_and_save_screenshot_with_action(
    base_folder: &str,
    action_label: &str, // Renamed for clarity
    mouse_pos: Option<(i32, i32)>
) -> Result<(), Box<dyn std::error::Error>> {
    let screenshot = capture_screen()?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let (_, images_dir, _, _) = create_recording_paths(base_folder)?;

    // Get current action folder name safely
    let action_folder_name = {
        RECORDING_STATE.lock().unwrap().current_action_folder
            .clone()
            .unwrap_or_else(|| "action_unknown".to_string()) // Safer default
    };

    let mouse_pos_str = mouse_pos.map_or(String::new(), |(x, y)| format!("_mouse_{}_{}", x, y));

    let file_path = images_dir.join(format!(
        "raw_{}_{}_folder_{}{}.png", // Removed trailing underscore
        timestamp,
        action_label,
        action_folder_name,
        mouse_pos_str
    ));

    screenshot.save(&file_path)?; // Save first

    // Encode for UI *after* saving
    let mut buffer = Cursor::new(Vec::new());
    // Consider a format with less compression if performance is critical, but PNG is good.
    screenshot.write_to(&mut buffer, ImageOutputFormat::Png)?;
    let encoded = STANDARD.encode(buffer.get_ref());

    // Update global frame
    *LATEST_FRAME.lock().unwrap() = Some(encoded);

    println!("Captured: {:?} (Action: {}, Mouse: {:?})", file_path.file_name().unwrap_or_default(), action_label, mouse_pos);
    Ok(())
}

// --- Global Listener Setup ---

fn setup_global_listener() {
    println!("Setting up global input listener...");
    let app_state_clone = Arc::clone(&GLOBAL_APP_STATE); // Clone Arc for thread

    thread::spawn(move || {
        let callback = move |event: Event| { // Use rdev::Event directly
            // Lock the global state only when needed
            let mut global_state = match app_state_clone.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(), // Handle poisoned mutex
            };

            // --- State-based event handling ---
            match global_state.input_state {
                AppInputState::Idle => { /* Do nothing */ }
                AppInputState::Recording => {
                    // Need to access RECORDING_STATE as well for recording logic
                    // Use try_lock to avoid potential deadlocks if main thread holds it,
                    // though careful design should prevent this. Or lock briefly.
                    if let Ok(mut rec_state) = RECORDING_STATE.lock() {
                        // Only proceed if recording is logically active and verified
                        if !rec_state.active || !rec_state.verified {
                            return;
                        }

                        let now = SystemTime::now();
                        let base_folder_opt = rec_state.base_folder.clone(); // Clone needed data
                        let mouse_pos_opt = rec_state.mouse_location; // Read last known location

                        // --- Recording Screenshot Logic (from old start_input_listeners) ---
                        match event.event_type {
                            EventType::ButtonPress(_) => {
                                println!("[Listener-Rec] Mouse Press");
                                rec_state.last_mouse_press_time = Some(now);
                                rec_state.is_mouse_button_down = true;
                                if let Some(folder) = base_folder_opt {
                                    thread::spawn(move || {
                                        thread::sleep(Duration::from_secs_f32(0.5)); // Shorter delay?
                                        let _ = capture_and_save_screenshot_with_action(&folder, "MousePress", mouse_pos_opt);
                                    });
                                }
                            },
                            EventType::ButtonRelease(_) => {
                                println!("[Listener-Rec] Mouse Release");
                                rec_state.is_mouse_button_down = false;
                                if let Some(folder) = base_folder_opt {
                                    thread::spawn(move || {
                                        thread::sleep(Duration::from_secs_f32(0.5)); // Shorter delay?
                                        let _ = capture_and_save_screenshot_with_action(&folder, "MouseRelease", mouse_pos_opt);
                                    });
                                }
                            },
                            EventType::Wheel { .. } => {
                                println!("[Listener-Rec] Mouse Wheel");
                                if let Some(folder) = base_folder_opt {
                                    thread::spawn(move || {
                                        thread::sleep(Duration::from_secs_f32(1.0));
                                        let _ = capture_and_save_screenshot_with_action(&folder, "MouseScroll", mouse_pos_opt);
                                    });
                                }
                            },
                            EventType::KeyPress(key) => {
                                if key == Key::Escape { return; } // Ignore Escape during recording? Or handle?

                                // Basic key press handling - Needs refinement for complex typing metric
                                println!("[Listener-Rec] Key Press: {:?}", key);
                                let key_str = format!("{:?}", key); // Basic representation

                                // TODO: Implement refined keyboard typing metric logic here if needed
                                // This simple version captures on every qualifying key press (after delay)
                                if let Some(folder) = base_folder_opt {
                                    thread::spawn(move || {
                                        thread::sleep(Duration::from_secs_f32(1.0));
                                        // Maybe add check here if user typed rapidly *after* this key was pressed
                                        let _ = capture_and_save_screenshot_with_action(&folder, &format!("KeyPress_{}", key_str), mouse_pos_opt);
                                    });
                                }
                            },
                            _ => {} // Ignore other events like Move, KeyRelease for screenshots
                        }
                        // --- End Recording Screenshot Logic ---
                    } else {
                        eprintln!("[Global Listener] Failed to lock RECORDING_STATE.");
                    }
                }
                AppInputState::ExecutingAction => {
                    // --- Check for Escape key to interrupt action loop ---
                    if let EventType::KeyPress(Key::Escape) = event.event_type {
                        println!("[Global Listener - Executing] Escape detected!");
                        global_state.action_interrupted = true; // Set flag in shared state
                    }
                }
            }
            // Mutex guard `global_state` is dropped here, unlocking
        }; // End of callback closure

        println!("[Global Listener Thread] Starting rdev::listen...");
        if let Err(error) = listen(callback) {
            eprintln!("[Global Listener Thread] ERROR during rdev::listen: {:?}", error);
            // This thread might exit here if rdev stops permanently
        }
        println!("[Global Listener Thread] rdev::listen finished (or errored).");
        // Note: This thread likely won't exit cleanly unless rdev errors or the main process exits.
    }); // End of thread spawn
}

// --- Mouse Tracking Thread (Still separate, started by start_recording) ---
// Renamed to avoid confusion with the main listener setup
fn start_mouse_location_tracker() {
    println!("Starting mouse location tracker thread...");
    // Use a clone of RECORDING_STATE's mutex if needed, or pass necessary fields
    // Keep it simple: access the global directly inside the thread.

    thread::spawn(move || {
        // Create enigo instance *within this thread* if only used here
        let enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Mouse tracker failed to init Enigo: {}", e);
                return;
            }
        };

        // Loop controlled by the *recording state*, not the global app state here
        while {
            RECORDING_STATE.lock().unwrap().active // Check if recording is active
        } {
            if let Ok((x, y)) = enigo.location() {
                if let Ok(mut rec_state) = RECORDING_STATE.lock() {
                    // Check active *again* after locking to handle race condition on stop
                    if rec_state.active {
                        rec_state.mouse_location = Some((x, y));
                    } else {
                        break; // Exit if recording stopped while waiting for lock
                    }
                }
            }
            thread::sleep(Duration::from_millis(50)); // Check frequency
        }
        println!("Mouse location tracker thread finished.");
    });
}

// --- Tauri Commands ---



fn extract_timestamp_from_filename(filename: &str) -> Option<u64> {
    // Using existing regex
    let re = Regex::new(r"raw_(\d+)_.*\.png").ok()?;
    let caps = re.captures(filename)?;
    caps.get(1)?.as_str().parse::<u64>().ok()
}

// Moved from action.rs for consolidation, needs imports: Path, fs, SystemTime, Regex, Client, serde_json, STANDARD Engine
fn process_recording_internal(base_folder: &str, _encryption_password: String) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    // --- This function body remains the same as provided in the previous answer ---
    // --- including sorting files and adding action_number ---
    let (_base, images_dir, encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    let mut results = Vec::new();
    let client = Client::builder().timeout(Duration::from_secs(120)).build()?;

    let action_folder_name = {
        let state = RECORDING_STATE.lock().unwrap();
        match &state.current_action_folder {
            Some(folder) => folder.clone(),
            None => {
                eprintln!("Warning: current_action_folder not set during processing. Using 'action_unknown'.");
                "action_unknown".to_string() // Safer default if state is somehow lost
            }
        }
    };

    let action_folder = encrypted_dir.join(&action_folder_name);
    if !action_folder.exists() {
        println!("Creating action folder for processing: {}", action_folder.display());
        fs::create_dir_all(&action_folder)?;
    } else {
        println!("Processing into existing action folder: {}", action_folder.display());
    }


    let mut files_with_timestamps: Vec<_> = fs::read_dir(&images_dir)?
        .filter_map(Result::ok) // Use filter_map(Result::ok)
        .filter_map(|e| {
            let path = e.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("png") {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .and_then(extract_timestamp_from_filename)
                    .map(|ts| (ts, path)) // Keep full path
            } else {
                None
            }
        })
        .collect();

    files_with_timestamps.sort_by_key(|&(ts, _)| ts);
    println!("Found {} images to process.", files_with_timestamps.len());


    let mut action_number = 0;

    for (file_timestamp, path) in files_with_timestamps {
        println!("Processing [{}]: {}", action_number, path.display());

        let image_bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) => { /* ... error handling ... */ continue; }
        };

        let image_base64 = STANDARD.encode(&image_bytes);
        let payload = json!({ "image": image_base64 });

        let resp = match client
            .post("http://localhost:5001/api/processImage") // Ensure URL is correct
            .json(&payload)
            .send() {
            Ok(resp) => resp,
            Err(e) => { /* ... error handling ... */ continue; }
        };

        let status = resp.status();
        println!(" -> Status: {}", status);

        if !status.is_success() {
            let error_body = resp.text().unwrap_or_else(|_| "No body".to_string());
            results.push(format!("Error processing {}: Status {} - {}", path.display(), status, error_body));
            continue;
        }

        let json_resp: serde_json::Value = match resp.json() {
            Ok(json_val) => json_val,
            Err(e) => { /* ... error handling ... */ continue; }
        };


        let csv_timestamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH)?.as_secs(); // Use processing time for CSV name

        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parts: Vec<&str> = file_stem.split('_').collect();
        let action = if parts.len() >= 3 { parts[2].to_string() } else { "Unknown".to_string() };
        let (mouse_x, mouse_y) = { /* ... mouse coord extraction ... */
            let mut x = "0".to_string();
            let mut y = "0".to_string();
            if let Some(mouse_idx) = parts.iter().position(|&p| p == "mouse") {
                if parts.len() > mouse_idx + 2 {
                    x = parts[mouse_idx + 1].to_string();
                    y = parts[mouse_idx + 2].to_string();
                }
            }
            (x, y)
        };

        // Modify CSV to add columns
        let parsed_csv_string = if let Some(parsed_content) = json_resp.get("parsed_content").and_then(|v| v.as_str()) {
            let mut lines = parsed_content.lines();
            let header = if let Some(h) = lines.next() {
                format!("{},action,mouse_x,mouse_y,action_number", h) // Add action_number header
            } else {
                // Fallback header if needed
                "type,bbox,interactivity,content,source,action,mouse_x,mouse_y,action_number".to_string()
            };
            let mut new_rows = vec![header];
            for line in lines {
                // Add action_number value
                new_rows.push(format!("{},{},{},{},{}", line, action, mouse_x, mouse_y, action_number));
            }
            new_rows.join("\n")
        } else {
            eprintln!("Warning: No 'parsed_content' found in JSON for {}", path.display());
            // Fallback CSV with action_number
            format!("type,bbox,interactivity,content,source,action,mouse_x,mouse_y,action_number\n,,,,{},{},{},{}", action, mouse_x, mouse_y, action_number)
        };

        let csv_path = action_folder.join(format!("parsed_content_{}_{}.csv", file_timestamp, csv_timestamp)); // Include original file timestamp?
        if let Err(e) = fs::write(&csv_path, &parsed_csv_string) {
            /* ... error handling ... */
            eprintln!("Error writing CSV file {}: {}", csv_path.display(), e);
            results.push(format!("Error writing CSV {}: {}", csv_path.display(), e));
        } else {
            results.push(format!("Processed {} -> CSV {}", path.file_name().unwrap_or_default().to_string_lossy(), csv_path.file_name().unwrap_or_default().to_string_lossy()));
        }

        if let Err(e) = fs::remove_file(&path) {
            eprintln!("Warning: Failed to delete raw screenshot {}: {}", path.display(), e);
        }

        action_number += 1; // Increment counter
    } // End loop through files

    Ok(results)
}

// Moved from action.rs
fn update_main_csv_entry(
    base_folder_str: &str,
    action_folder_to_find: &str,
    new_name: &str,
) -> Result<(), String> {
    // --- This function body remains the same as provided in the previous answer ---
    // --- including reading, rebuilding records, and rewriting ---
    let base_folder = Path::new(base_folder_str);
    let main_csv_path = base_folder.join("main.csv");

    if !main_csv_path.exists() { return Err("main.csv does not exist.".to_string()); }

    let file_content = fs::read_to_string(&main_csv_path).map_err(|e| format!("Failed to read main.csv: {}", e))?;
    let mut rdr = ReaderBuilder::new().has_headers(true).from_reader(file_content.as_bytes());
    let headers = rdr.headers().map_err(|e| format!("Failed to read headers: {}", e))?.clone();
    let mut records: Vec<StringRecord> = Vec::new();
    let mut updated = false;
    let location_index = headers.iter().position(|h| h == "location").ok_or("Missing 'location' header")?;
    let query_index = headers.iter().position(|h| h == "query").ok_or("Missing 'query' header")?;

    for result in rdr.records() {
        let record = result.map_err(|e| format!("Failed to parse record: {}", e))?;
        if record.get(location_index) == Some(action_folder_to_find) {
            let mut current_fields: Vec<String> = record.iter().map(String::from).collect();
            if query_index < current_fields.len() {
                current_fields[query_index] = new_name.to_string();
                let updated_record = StringRecord::from(current_fields);
                records.push(updated_record);
                println!("Updating record for '{}' with name '{}'", action_folder_to_find, new_name);
                updated = true;
            } else {
                records.push(record); // Keep original if index issue
                eprintln!("Warning: Query index out of bounds. Skipping update for this record.");
            }
        } else {
            records.push(record); // Keep non-matching records
        }
    }

    if !updated {
        eprintln!("Warning/Info: Did not find entry for action folder '{}' to update.", action_folder_to_find);
        return Ok(()); // Don't error if not found, maybe already renamed or just started
    }

    // Rewrite
    let mut wtr = WriterBuilder::new().has_headers(true).from_path(&main_csv_path)
        .map_err(|e| format!("Failed to write main.csv: {}", e))?;
    wtr.write_record(&headers).map_err(|e| format!("Failed to write header: {}", e))?;
    for record_to_write in records {
        wtr.write_record(&record_to_write).map_err(|e| format!("Failed to write record: {}", e))?;
    }
    wtr.flush().map_err(|e| format!("Failed to flush writer: {}", e))?;
    println!("Successfully updated main.csv for action '{}'", action_folder_to_find);
    Ok(())
}


fn summarize_recording_internal(base_folder: &str) -> Result<String, Box<dyn std::error::Error>> {
    // Dummy implementation
    let (_base, _images_dir, _encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    Ok(format!("Dummy summary for recording in {}", base_folder))
}

// --- Main Function ---
fn main() {
    // Ensure X11 threads are initialized for Linux GUI apps that might use Xlib indirectly
    #[cfg(target_os = "linux")]
    unsafe {
        // Consider conditional compilation or checking if running under Wayland vs X11
        // if std::env::var("XDG_SESSION_TYPE").unwrap_or_default() == "x11" {
        xlib::XInitThreads();
        // }
    }

    // --- Start the single global listener ---
    setup_global_listener();
    // --------------------------------------

    tauri::Builder::default()
        // Add state management if needed via .manage()
        .invoke_handler(tauri::generate_handler![
            start_recording,
            verify_recording,
            stop_recording,
            summarize_recording,
            get_latest_frame,
            start_act, // This calls action::execute_task_loop
            update_current_action_name // Updates main.csv during recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- Make sure action.rs is correctly included ---
// Ensure action.rs has access to GLOBAL_APP_STATE and AppInputState:
// Add `use crate::{GLOBAL_APP_STATE, AppInputState};` at the top of action.rs
// Ensure execute_task_loop in action.rs is modified to:
//   1. Remove start_esc_listener() and stop_esc_listener() calls.
//   2. Set GLOBAL_APP_STATE.input_state = AppInputState::ExecutingAction at the start.
//   3. Set GLOBAL_APP_STATE.action_interrupted = false at the start.
//   4. Check GLOBAL_APP_STATE.lock().unwrap().action_interrupted inside the loop.
//   5. Set GLOBAL_APP_STATE.input_state = AppInputState::Idle when the loop finishes (Ok or Err).
//   6. Determine base_folder path on demand if RECORDING_STATE.base_folder is None.