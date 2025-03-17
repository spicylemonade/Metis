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

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod action;
#[cfg(target_os = "linux")]
use x11::xlib;
use std::{
    io::Cursor,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use std::collections::VecDeque;
use once_cell::sync::Lazy;
use dirs::download_dir; // For user's Downloads folder
use tauri;
use rdev::{listen, EventType};
use image::{DynamicImage, ImageError, ImageOutputFormat};
use base64::engine::general_purpose::STANDARD;
use base64::Engine; // Bring the Engine trait into scope
use enigo::{Enigo, Mouse, Settings};
// Use xcap for screen capture.
use xcap::Monitor;

use reqwest::blocking::Client;
use serde_json::json;

/// Returns the default base folder: user's Downloads folder joined with "screenshots"
fn get_default_base_folder() -> PathBuf {
    download_dir()
        .unwrap_or_else(|| PathBuf::from("C:\\Downloads"))
        .join("screenshots")
}

/// Global recording state with input metrics.
#[derive(Default)]
struct RecordingState {
    active: bool,
    verified: bool,
    base_folder: Option<String>,
    current_action_folder: Option<String>,
    mouse_location: Option<(i32, i32)>,
    last_capture: u64,
    // Mouse events:
    last_mouse_press: Option<SystemTime>,
    mouse_button_pressed: bool,

    // Keyboard events:
    key_press_count: u32,

    last_key_press: Option<SystemTime>,
}

struct Skill{
    connections: Option<Vec<Skill>>,
    Value: String,
    connection_size: u32,
    size: u32,
}
/// Global variable to hold the most recent frame (as base64 PNG).
static LATEST_FRAME: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

// In main.rs - make RECORDING_STATE public
pub static RECORDING_STATE: Lazy<Mutex<RecordingState>> =
    Lazy::new(|| Mutex::new(RecordingState::default()));

//
// Tauri Commands
//

#[tauri::command]
fn start_recording() -> Result<String, String> {
    let base_folder = get_default_base_folder();
    let (_, _, encrypted_dir, _) = create_recording_paths(base_folder.to_str().unwrap()).map_err(|e| e.to_string())?;

    // Determine the next action folder
    let mut action_index = 0;
    loop {
        let action_folder = encrypted_dir.join(format!("action_{}", action_index));
        if !action_folder.exists() {
            std::fs::create_dir_all(&action_folder).map_err(|e| e.to_string())?;
            break;
        }
        action_index += 1;
    }

    // Use the new action folder
    let action_folder_name = format!("action_{}", action_index);

    // Create or update main.csv
    action::create_main_csv(&base_folder, &action_folder_name)
        .map_err(|e| format!("Failed to update main.csv: {}", e))?;

    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = true;
        state.verified = false;
        state.base_folder = Some(base_folder.to_str().unwrap().to_string());
        state.current_action_folder = Some(action_folder_name);  // Set the current action folder
        state.last_capture = 0;
        state.last_mouse_press = None;
        state.mouse_button_pressed = false;
        state.key_press_count = 0;
        state.last_key_press = None;
    }
    thread::spawn(|| {
        start_input_listeners();
    });
    Ok(format!("Recording started with base folder: {:?}", base_folder))
}

#[tauri::command]
fn verify_recording() -> Result<String, String> {
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        if !state.active {
            return Err("Recording is not active".into());
        }
        state.verified = true;
    }
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state
            .base_folder
            .clone()
            .unwrap_or_else(|| get_default_base_folder().to_str().unwrap().to_string())
    };
    thread::spawn(move || {
        // Capture one screenshot immediately; label it "Init"
        if let Err(e) = capture_and_save_screenshot_with_action(base_folder.as_str(), "Init", Some((0, 0))) {
            eprintln!("Error capturing screenshot: {}", e);
        }
    });
    Ok("Recording verified. Input events will now trigger screenshots.".into())
}

#[tauri::command]
fn stop_recording(encryption_password: String) -> Result<String, String> {
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.base_folder.clone().ok_or("Base folder not set")?
    };
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = false;
    }
    // Spawn a background thread to process all raw screenshots.
    let base_folder_clone = base_folder.clone();
    let encryption_password_clone = encryption_password.clone();
    thread::spawn(move || {
        match process_recording_internal(base_folder_clone.as_str(), encryption_password_clone) {
            Ok(res) => println!("Processing complete: :)"),
            Err(e) => eprintln!("Error processing recordings: {}", e),
        }
    });
    Ok("Recording stopped. Processing in background.".to_string())
}

#[tauri::command]
fn summarize_recording() -> Result<String, String> {
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.base_folder.clone().ok_or("Base folder not set")?
    };
    let summary = summarize_recording_internal(base_folder.as_str())
        .map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
fn get_latest_frame() -> Result<String, String> {
    let frame = LATEST_FRAME.lock().unwrap();
    if let Some(ref data) = *frame {
        Ok(data.clone())
    } else {
        // Fallback: 1x1 black pixel PNG.
        let fallback = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUCNdj+P///38ACfsD/6EXSgAAAABJRU5ErkJggg==";
        Ok(fallback.to_string())
    }
}

//
// Utility Functions
//

fn create_recording_paths(base_folder: &str) -> std::io::Result<(PathBuf, PathBuf, PathBuf, PathBuf)> {
    let base = PathBuf::from(base_folder);
    let images = base.join("images");
    let encrypted = base.join("encrypted_csv");
    let salt = base.join("salt");
    std::fs::create_dir_all(&images)?;
    std::fs::create_dir_all(&encrypted)?;
    std::fs::create_dir_all(&salt)?;
    Ok((base, images, encrypted, salt))
}

/// Captures a screenshot and saves it with the provided action in its filename.
/// Captures a screenshot and saves it with the provided action and mouse position in its filename.
/// Captures a screenshot and saves it with the provided action and mouse position in its filename.
fn capture_and_save_screenshot_with_action(
    base_folder: &str,
    action: &str,
    mouse_pos: Option<(i32, i32)>  // Changed type to match enigo's return type
) -> Result<(), Box<dyn std::error::Error>> {
    // Capture the screenshot
    let screenshot = match capture_screen() {
        Ok(screenshot) => screenshot,
        Err(e) => {
            eprintln!("Failed to capture screenshot: {}", e);
            return Err(Box::new(e));
        }
    };

    // Get current timestamp
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    // Create necessary directories
    let (_, images_dir, _, _) = create_recording_paths(base_folder)?;

    // Ensure the images directory exists
    if !images_dir.exists() {
        std::fs::create_dir_all(&images_dir)?;
    }

    // Get the current action folder
    let action_folder = {
        let state = RECORDING_STATE.lock().unwrap();
        state.current_action_folder.clone().unwrap_or_else(|| "action_0".to_string())
    };

    // Format mouse position for filename
    let mouse_pos_str = match mouse_pos {
        Some((x, y)) => format!("_mouse_{}_{}",  x, y),
        None => String::new(),
    };

    // Construct the full filename with timestamp, action, action folder, and mouse position
    let file_path = images_dir.join(format!(
        "raw_{}_{}_folder_{}{}_.png",
        timestamp,
        action,
        action_folder,
        mouse_pos_str
    ));

    // Save the screenshot to the file
    match screenshot.save(&file_path) {
        Ok(_) => {},
        Err(e) => {
            eprintln!("Failed to save screenshot to {}: {}", file_path.display(), e);
            return Err(Box::new(e));
        }
    }

    // Create a buffer for encoding the screenshot
    let mut buffer = Cursor::new(Vec::new());
    screenshot.write_to(&mut buffer, ImageOutputFormat::Png)?;

    // Encode the screenshot for UI display
    let encoded = STANDARD.encode(buffer.get_ref());

    // Update the latest frame
    {
        let mut latest = LATEST_FRAME.lock().unwrap();
        *latest = Some(encoded);
    }

    println!("Captured and saved screenshot: {:?} with action: {} and mouse position: {:?}",
             file_path, action, mouse_pos);

    Ok(())
}
/// Listens to global input events and triggers screenshot capture with action labels.

fn start_input_listeners() {
    // Create enigo instance once
    let enigo = match Enigo::new(&Settings::default()) {
        Ok(enigo) => enigo,
        Err(e) => {
            eprintln!("Failed to initialize Enigo: {}", e);
            return;
        }
    };

    // Start a separate thread for continuous mouse tracking
    thread::spawn(move || {
        while {
            let state = RECORDING_STATE.lock().unwrap();
            state.active
        } {
            // Get current mouse position using enigo
            if let Ok((x, y)) = enigo.location() {
                // Update the state
                let mut state = RECORDING_STATE.lock().unwrap();
                if state.active {
                    state.mouse_location = Some((x, y));
                }
            }

            // Sleep to avoid excessive CPU usage
            thread::sleep(Duration::from_millis(50));
        }
    });

    let callback = |event: rdev::Event| {
        let now = SystemTime::now();
        let mut state = RECORDING_STATE.lock().unwrap();
        if !state.active || !state.verified {
            return;
        }

        // We don't need to get mouse position here anymore since
        // it's being continuously updated by the thread above
        let mouse_pos = state.mouse_location;

        match event.event_type {
            EventType::ButtonPress(_) => {
                state.last_mouse_press = Some(now);
                state.mouse_button_pressed = true;
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(0.5));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MousePress", mouse_pos);
                    });
                }
            },
            // Do the same for other event types...
            EventType::ButtonRelease(_) => {
                state.mouse_button_pressed = false;
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(0.5));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MouseRelease", mouse_pos);
                    });
                }
            },
            EventType::Wheel { .. } => {
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(1.0));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MouseScroll", mouse_pos);
                    });
                }
            },
            EventType::KeyPress(key) => {
                let key_str = format!("{:?}", key);
                if let Some(last) = state.last_key_press {
                    if now.duration_since(last).unwrap_or(Duration::from_secs(0)) < Duration::from_secs(2) {
                        state.key_press_count += 1;
                    } else {
                        state.key_press_count = 1;
                    }
                } else {
                    state.key_press_count = 1;
                }
                state.last_key_press = Some(now);
                let current_count = state.key_press_count;
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(1.0));
                        let state = RECORDING_STATE.lock().unwrap();
                        if state.last_key_press.map(|t| t.elapsed().unwrap_or(Duration::from_secs(0))) >= Some(Duration::from_secs(1))
                            && current_count <= 3 {
                            drop(state);
                            let _ = capture_and_save_screenshot_with_action(folder.as_str(), &format!("KeyPress_{}", key_str), mouse_pos);
                        }
                    });
                }
            },
            EventType::KeyRelease(_) => { },
            _ => {},
        }
    };

    if let Err(error) = listen(callback) {
        eprintln!("Error starting global input listener: {:?}", error);
    }
}
/// Captures a screenshot using xcap, saves it, and updates LATEST_FRAME.
fn capture_and_save_screenshot(base_folder: &str) -> Result<(), Box<dyn std::error::Error>> {
    let screenshot = capture_screen()?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let (_, images_dir, _, _) = create_recording_paths(base_folder)?;
    let file_path = images_dir.join(format!("raw_{}.png", timestamp));
    screenshot.save(&file_path)?;
    let mut buffer = Cursor::new(Vec::new());
    screenshot.write_to(&mut buffer, ImageOutputFormat::Png)?;
    let encoded = STANDARD.encode(buffer.get_ref());
    let mut latest = LATEST_FRAME.lock().unwrap();
    *latest = Some(encoded);
    println!("Captured and saved screenshot: {:?}", file_path);
    Ok(())
}

/// Captures an actual screenshot of the primary display using xcap.
/// Captures an actual screenshot of the primary display using xcap.
fn capture_screen() -> Result<image::DynamicImage, ImageError> {
    // Catch panics to prevent app crashes
    let result = std::panic::catch_unwind(|| {
        // Retrieve all available monitors.
        let monitors = match Monitor::all() {
            Ok(m) => m,
            Err(e) => {
                return Err(ImageError::IoError(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to get monitors: {:?}", e),
                )));
            }
        };

        if monitors.is_empty() {
            return Err(ImageError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No monitors found",
            )));
        }

        // For this example, select the first monitor.
        let primary_monitor = &monitors[0];
        let xcap_image = match primary_monitor.capture_image() {
            Ok(img) => img,
            Err(e) => {
                return Err(ImageError::IoError(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to capture image: {:?}", e),
                )));
            }
        };

        // Get width and height before consuming the image.
        let width = xcap_image.width();
        let height = xcap_image.height();

        // Extract the raw bytes. This consumes the xcap_image.
        let raw = xcap_image.into_raw();

        // Convert the raw bytes into an ImageBuffer from the image crate.
        let buffer = match image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, raw) {
            Some(buf) => buf,
            None => {
                return Err(ImageError::IoError(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Failed to convert captured image to ImageBuffer",
                )));
            }
        };

        // Wrap the buffer in a DynamicImage.
        Ok(image::DynamicImage::ImageRgba8(buffer))
    });

    match result {
        Ok(res) => res,
        Err(_) => Err(ImageError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Panic occurred during screen capture",
        ))),
    }
}
#[tauri::command]
fn start_act(command: String) -> Result<bool, String> {
    action::start_action(command)
}

/// Processes all raw screenshots by sending them to the Python endpoint,
/// adds the action (extracted from the filename) as a new column in the CSV,
/// moves the CSV into a new folder "action_{n}" inside encrypted_csv,
/// and clears any leftover raw screenshots.
fn process_recording_internal(base_folder: &str, _encryption_password: String) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let (_base, images_dir, encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    let mut results = Vec::new();
    let client = Client::builder().timeout(Duration::from_secs(120)).build()?;

    // Get the current action folder from recording state
    let action_folder_name = {
        let state = RECORDING_STATE.lock().unwrap();
        match &state.current_action_folder {
            Some(folder) => folder.clone(),
            None => "action_0".to_string()  // Fallback
        }
    };

    // Use the specified action folder
    let action_folder = encrypted_dir.join(&action_folder_name);
    if !action_folder.exists() {
        std::fs::create_dir_all(&action_folder)?;
    }

    // List all PNG files.
    let files: Vec<_> = std::fs::read_dir(&images_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("png"))
        .collect();

    // Accumulate parsed CSV rows.
    let mut all_rows: Vec<String> = Vec::new();

    for entry in files {
        let path = entry.path();
        println!("Processing file: {}", path.display());

        let image_bytes = std::fs::read(&path)?;


        let image_base64 = STANDARD.encode(&image_bytes);
        let payload = json!({ "image": image_base64 });
        let resp = client
            .post("http://localhost:5001/api/processImage")
            .json(&payload)
            .send()?;

        println!("Received response status: {}", resp.status());
        if !resp.status().is_success() {
            results.push(format!("Error processing {}: {}", path.display(), resp.status()));
            continue;
        }

        let json_resp: serde_json::Value = resp.json()?;


        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        // Extract information from the filename
        // Expected format: raw_{timestamp}_{action}_folder_{folder}_mouse_{x}_{y}_.png
        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parts: Vec<&str> = file_stem.split('_').collect();

        // Extract action
        let action = if parts.len() >= 3 {
            parts[2].to_string()
        } else {
            "Unknown".to_string()
        };

        // Extract mouse position
        let (mouse_x, mouse_y) = {
            let mut x = "0".to_string();
            let mut y = "0".to_string();

            // Find the index of "mouse" in the parts array
            if let Some(mouse_idx) = parts.iter().position(|&p| p == "mouse") {
                // Make sure we have at least two more elements after "mouse"
                if parts.len() > mouse_idx + 2 {
                    x = parts[mouse_idx + 1].to_string();
                    y = parts[mouse_idx + 2].to_string();
                }
            }

            (x, y)
        };

        // Modify parsed CSV text by adding new columns "action", "mouse_x", and "mouse_y"
        let parsed_csv = if let Some(parsed_content) = json_resp.get("parsed_content").and_then(|v| v.as_str()) {
            let mut lines = parsed_content.lines();
            let header = if let Some(h) = lines.next() {
                format!("{},action,mouse_x,mouse_y", h)
            } else {
                "action,mouse_x,mouse_y".to_string()
            };

            let mut new_rows = vec![header];
            for line in lines {
                new_rows.push(format!("{},{},{},{}", line, action, mouse_x, mouse_y));
            }
            new_rows.join("\n")
        } else {
            "No parsed content".to_string()
        };

        // Save the CSV into the action folder.
        let csv_path = action_folder.join(format!("parsed_content_{}.csv", timestamp));
        std::fs::write(&csv_path, &parsed_csv)?;

        // Delete the raw screenshot.
        std::fs::remove_file(&path)?;
        results.push(format!("Processed file {} into CSV at {:?}", path.display(), csv_path));

        // Accumulate the CSV text.
        all_rows.push(parsed_csv.clone());
    }

    // Clear any leftover raw images.
    for entry in std::fs::read_dir(&images_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("png") {
            let _ = std::fs::remove_file(&path);
        }
    }

    Ok(results)
}

fn summarize_recording_internal(base_folder: &str) -> Result<String, Box<dyn std::error::Error>> {
    let (_base, _images_dir, _encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    Ok("Dummy summary of recording".into())
}

fn main() {
    #[cfg(target_os = "linux")]
    unsafe {
        xlib::XInitThreads();
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_recording,
            verify_recording,
            stop_recording,
            summarize_recording,
            get_latest_frame,
            start_act
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
