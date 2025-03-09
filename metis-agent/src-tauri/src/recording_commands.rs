/*
Input Metrics:
- Simple Clicking: On a mouse button press, take one screenshot 1 second after the press.
- Click and Drag: Take a screenshot 1 second after the press and another 1 second after release.
- Keyboard Typing:
   • If fewer than 4 keys are pressed within 2 seconds, take a screenshot 1 second after a key press.
   • If more than 3 keys are pressed in under 2 seconds, cancel any pending screenshot and only take one 
     after 1 second of no typing.
- Mouse Movement (without a click) does not trigger a screenshot.
*/

use std::{
    collections::HashSet,
    io::Cursor,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use once_cell::sync::Lazy;
use dirs::download_dir; // For user's Downloads folder
use tauri;
use rdev::{listen, EventType};
use image::{DynamicImage, ImageError, ImageOutputFormat};
use base64::engine::general_purpose::STANDARD; // Base64 engine
use base64::Engine; // Bring the Engine trait into scope

// Scrap for desktop capture.
use scrap::{Capturer, Display};

// Enhanced recording state with input metrics tracking
#[derive(Default)]
pub struct RecordingState {
    active: bool,
    verified: bool,
    base_folder: Option<String>,
    last_capture: u64,
    
    // Mouse events
    last_mouse_press: Option<Instant>,
    mouse_button_pressed: bool,
    pending_click_screenshots: HashSet<u64>, // Track pending screenshots by ID
    
    // Keyboard events
    key_presses: Vec<Instant>,
    pending_key_screenshots: HashSet<u64>,
    rapid_typing_detected: bool,
    last_key_activity: Option<Instant>,
}

impl RecordingState {
    pub fn new() -> Self {
        Self::default()
    }
}

// IDs for scheduled screenshots
static NEXT_SCREENSHOT_ID: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));

// Global variable to hold the most recent frame (as base64 PNG)
static LATEST_FRAME: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

// Global recording state
static RECORDING_STATE: Lazy<Mutex<RecordingState>> = Lazy::new(|| Mutex::new(RecordingState::default()));

//
// Tauri Commands
//

#[tauri::command]
pub fn start_recording() -> Result<String, String> {
    let base_folder = get_default_base_folder();
    create_recording_paths(base_folder.to_str().unwrap()).map_err(|e| e.to_string())?;
    
    // Reset state
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = true;
        state.verified = false;
        state.base_folder = Some(base_folder.to_str().unwrap().to_string());
        state.last_capture = 0;
        state.last_mouse_press = None;
        state.mouse_button_pressed = false;
        state.key_presses.clear();
        state.pending_click_screenshots.clear();
        state.pending_key_screenshots.clear();
        state.rapid_typing_detected = false;
        state.last_key_activity = None;
    }
    
    // Start the input event listener in a background thread
    thread::spawn(|| {
        start_input_listeners();
    });
    
    Ok(format!("Recording started with base folder: {:?}", base_folder))
}

#[tauri::command]
pub fn verify_recording() -> Result<String, String> {
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        if !state.active {
            return Err("Recording is not active".into());
        }
        state.verified = true;
    }
    
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.base_folder.clone().unwrap_or_else(|| get_default_base_folder().to_str().unwrap().to_string())
    };
    
    // Capture initial screenshot
    thread::spawn(move || {
        if let Err(e) = capture_and_save_screenshot_with_action(base_folder.as_str(), "Init") {
            eprintln!("Error capturing initial screenshot: {}", e);
        }
    });
    
    Ok("Recording verified. Input events will now trigger screenshots.".into())
}

#[tauri::command]
pub fn stop_recording(encryption_password: String) -> Result<String, String> {
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.base_folder.clone().ok_or("Base folder not set")?
    };
    
    // Update state
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = false;
        state.verified = false;
        state.pending_click_screenshots.clear();
        state.pending_key_screenshots.clear();
    }
    
    // Process recordings in background
    let base_folder_clone = base_folder.clone();
    let encryption_password_clone = encryption_password.clone();
    thread::spawn(move || {
        match process_recording_internal(base_folder_clone.as_str(), encryption_password_clone) {
            Ok(res) => println!("Processing complete: {:?}", res),
            Err(e) => eprintln!("Error processing recordings: {}", e),
        }
    });
    
    Ok("Recording stopped. Processing in background.".to_string())
}

#[tauri::command]
pub fn get_latest_frame() -> Result<String, String> {
    let frame = LATEST_FRAME.lock().unwrap();
    if let Some(ref data) = *frame {
        Ok(data.clone())
    } else {
        // Fallback: 1x1 black pixel PNG
        let fallback = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUCNdj+P///38ACfsD/6EXSgAAAABJRU5ErkJggg==";
        Ok(fallback.to_string())
    }
}

#[tauri::command]
pub fn get_recording_status() -> Result<serde_json::Value, String> {
    let state = RECORDING_STATE.lock().unwrap();
    
    let json = serde_json::json!({
        "active": state.active,
        "verified": state.verified,
        "pending_click_screenshots": state.pending_click_screenshots.len(),
        "pending_key_screenshots": state.pending_key_screenshots.len(),
        "rapid_typing_detected": state.rapid_typing_detected,
    });
    
    Ok(json)
}

#[tauri::command]
pub fn is_recording_active() -> Result<bool, String> {
    let state = RECORDING_STATE.lock().unwrap();
    Ok(state.active)
}

//
// Utility Functions
//

pub fn get_default_base_folder() -> PathBuf {
    download_dir()
        .unwrap_or_else(|| PathBuf::from("C:\\Downloads"))
        .join("screenshots")
}

pub fn create_recording_paths(base_folder: &str) -> std::io::Result<(PathBuf, PathBuf, PathBuf, PathBuf)> {
    let base = PathBuf::from(base_folder);
    let images = base.join("images");
    let encrypted = base.join("encrypted_csv");
    let salt = base.join("salt");
    std::fs::create_dir_all(&images)?;
    std::fs::create_dir_all(&encrypted)?;
    std::fs::create_dir_all(&salt)?;
    Ok((base, images, encrypted, salt))
}

pub fn is_recording_active_and_verified() -> bool {
    let state = RECORDING_STATE.lock().unwrap();
    state.active && state.verified
}

fn get_next_screenshot_id() -> u64 {
    let mut id = NEXT_SCREENSHOT_ID.lock().unwrap();
    *id += 1;
    *id
}

/// Captures a screenshot and saves it with the provided action label
pub fn capture_and_save_screenshot_with_action(base_folder: &str, action: &str) -> Result<(), Box<dyn std::error::Error>> {
    let screenshot = capture_screen()?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let (_, images_dir, _, _) = create_recording_paths(base_folder)?;
    
    // Save the screenshot with action label in filename
    let file_path = images_dir.join(format!("raw_{}_{}.png", timestamp, action));
    screenshot.save(&file_path)?;
    
    // Convert to base64 for preview
    let mut buffer = Cursor::new(Vec::new());
    screenshot.write_to(&mut buffer, ImageOutputFormat::Png)?;
    let encoded = STANDARD.encode(buffer.get_ref());
    
    // Update the latest frame
    let mut latest = LATEST_FRAME.lock().unwrap();
    *latest = Some(encoded);
    
    println!("Captured and saved screenshot: {:?}", file_path);
    Ok(())
}

/// Captures a screenshot using scrap
fn capture_screen() -> Result<DynamicImage, ImageError> {
    let display = Display::primary().map_err(|e| ImageError::IoError(e))?;
    let mut capturer = Capturer::new(display).map_err(|e| ImageError::IoError(e))?;
    let (w, h) = (capturer.width(), capturer.height());
    
    // Wait for a valid frame
    let frame = loop {
        match capturer.frame() {
            Ok(frame) => {
                if frame.iter().all(|&x| x == 0) {
                    thread::sleep(Duration::from_millis(50));
                    continue;
                }
                break frame;
            },
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
                continue;
            },
            Err(e) => return Err(ImageError::IoError(e)),
        }
    };
    
    // Convert the frame to an image
    use image::{ImageBuffer, Rgba};
    let mut buffer = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(w as u32, h as u32);
    for (x, y, pixel) in buffer.enumerate_pixels_mut() {
        let i = ((y as usize * w) + x as usize) * 4;
        let b = frame[i];
        let g = frame[i + 1];
        let r = frame[i + 2];
        let a = frame[i + 3];
        *pixel = Rgba([r, g, b, a]);
    }
    
    Ok(DynamicImage::ImageRgba8(buffer))
}

/// Schedule a screenshot to be taken after a delay
fn schedule_screenshot(delay_ms: u64, action: &str, category: String) -> u64 {
    if !is_recording_active_and_verified() {
        return 0;
    }
    
    let screenshot_id = get_next_screenshot_id();
    let action_string = action.to_string();
    
    // Register the pending screenshot
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        match category.as_str() {
            "click" => { state.pending_click_screenshots.insert(screenshot_id); },
            "key" => { state.pending_key_screenshots.insert(screenshot_id); },
            _ => { /* unknown category */ }
        }
    }
    
    // Get base folder
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.base_folder.clone().unwrap_or_else(|| get_default_base_folder().to_str().unwrap().to_string())
    };
    
    // Spawn a thread to take the screenshot after the delay
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(delay_ms));
        
        // Check if screenshot is still scheduled
        let should_capture = {
            let state = RECORDING_STATE.lock().unwrap();
            match category.as_str() {
                "click" => state.active && state.verified && state.pending_click_screenshots.contains(&screenshot_id),
                "key" => state.active && state.verified && state.pending_key_screenshots.contains(&screenshot_id),
                _ => false
            }
        };
        
        if should_capture {
            // Remove from pending set first to prevent race conditions
            {
                let mut state = RECORDING_STATE.lock().unwrap();
                match category.as_str() {
                    "click" => { state.pending_click_screenshots.remove(&screenshot_id); },
                    "key" => { state.pending_key_screenshots.remove(&screenshot_id); },
                    _ => {}
                }
            }
            
            // Take the screenshot
            if let Err(e) = capture_and_save_screenshot_with_action(&base_folder, &action_string) {
                eprintln!("Error capturing scheduled screenshot: {}", e);
            }
        }
    });
    
    screenshot_id
}

/// Cancel all pending keyboard screenshots
fn cancel_pending_key_screenshots() {
    let mut state = RECORDING_STATE.lock().unwrap();
    state.pending_key_screenshots.clear();
}

/// Global input event listener
fn start_input_listeners() {
    let callback = |event: rdev::Event| {
        let now = Instant::now();
        
        // Skip if recording is not active and verified
        if !is_recording_active_and_verified() {
            return;
        }
        
        match event.event_type {
            EventType::ButtonPress(_) => {
                // Update state
                {
                    let mut state = RECORDING_STATE.lock().unwrap();
                    state.last_mouse_press = Some(now);
                    state.mouse_button_pressed = true;
                }
                
                // Schedule screenshot 1 second after press
                schedule_screenshot(1000, "MousePress", "click".to_string());
            },
            
            EventType::ButtonRelease(_) => {
                // Only schedule release screenshot if we were tracking a press
                let should_capture = {
                    let mut state = RECORDING_STATE.lock().unwrap();
                    let was_pressed = state.mouse_button_pressed;
                    state.mouse_button_pressed = false;
                    was_pressed
                };
                
                if should_capture {
                    // Schedule screenshot 1 second after release
                    schedule_screenshot(1000, "MouseRelease", "click".to_string());
                }
            },
            
            EventType::KeyPress(_) => {
                // Update keyboard state
                let (rapid_typing, should_cancel) = {
                    let mut state = RECORDING_STATE.lock().unwrap();
                    
                    // Clean up key presses older than 2 seconds
                    let two_seconds_ago = now - Duration::from_secs(2);
                    state.key_presses.retain(|&time| time > two_seconds_ago);
                    
                    // Add current key press
                    state.key_presses.push(now);
                    state.last_key_activity = Some(now);
                    
                    // Check if we're in rapid typing mode (> 3 keys in 2 seconds)
                    let rapid_typing = state.key_presses.len() > 3;
                    let was_rapid_typing = state.rapid_typing_detected;
                    state.rapid_typing_detected = rapid_typing;
                    
                    // Determine if we should cancel pending screenshots
                    let should_cancel = rapid_typing && !was_rapid_typing;
                    
                    (rapid_typing, should_cancel)
                };
                
                // Cancel pending key screenshots if we just entered rapid typing mode
                if should_cancel {
                    cancel_pending_key_screenshots();
                }
                
                if !rapid_typing {
                    // If not rapid typing, schedule a screenshot 1 second after this key press
                    schedule_screenshot(1000, "KeyPress", "key".to_string());
                } else {
                    // Schedule an "idle detection" check for 1 second later
                    let screenshot_id = get_next_screenshot_id();
                    
                    // Clone what we need for the thread
                    let base_folder = {
                        let state = RECORDING_STATE.lock().unwrap();
                        state.base_folder.clone().unwrap_or_else(|| get_default_base_folder().to_str().unwrap().to_string())
                    };
                    
                    thread::spawn(move || {
                        // Wait 1 second to check for idle
                        thread::sleep(Duration::from_secs(1));
                        
                        // Check if we've been idle for 1 second
                        let should_capture = {
                            let state = RECORDING_STATE.lock().unwrap();
                            
                            // Only capture if we're still in rapid typing mode and it's been 1 second since last activity
                            state.active && 
                            state.verified && 
                            state.rapid_typing_detected && 
                            state.last_key_activity
                                .map(|t| now.duration_since(t) >= Duration::from_secs(1))
                                .unwrap_or(false)
                        };
                        
                        if should_capture {
                            // Take a screenshot after 1 second of no typing
                            if let Err(e) = capture_and_save_screenshot_with_action(&base_folder, "KeyboardIdle") {
                                eprintln!("Error capturing keyboard idle screenshot: {}", e);
                            }
                            
                            // Reset rapid typing detection
                            let mut state = RECORDING_STATE.lock().unwrap();
                            state.rapid_typing_detected = false;
                            state.key_presses.clear();
                        }
                    });
                }
            },
            
            // All other events (like mouse move) are ignored
            _ => {}
        }
    };
    
    // Start listening for global input events
    if let Err(error) = listen(callback) {
        eprintln!("Error starting global input listener: {:?}", error);
    }
}

/// Processes all raw screenshots according to your original implementation
pub fn process_recording_internal(base_folder: &str, _encryption_password: String) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    // Your existing process_recording_internal code here
    // This would include sending to Python endpoint, organizing CSVs, etc.
    let (_base, images_dir, _encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    
    // Simulation of processing for testing
    let mut results = Vec::new();
    
    // List all PNG files
    let files: Vec<_> = std::fs::read_dir(&images_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("png"))
        .collect();
    
    for file in files {
        results.push(format!("Processed file: {:?}", file.path()));
    }
    
    Ok(results)
}

// Add to main.rs in tauri::Builder::default():
// .invoke_handler(tauri::generate_handler![
//     start_recording,
//     verify_recording,
//     stop_recording,
//     get_latest_frame,
//     get_recording_status,
// ])