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

use std::{
    io::Cursor,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use once_cell::sync::Lazy;
use dirs::download_dir; // For user's Downloads folder
use tauri;
use rdev::{listen, Event, EventType};
use image::{DynamicImage, ImageError, ImageOutputFormat};
use base64::engine::general_purpose::STANDARD; // Base64 engine
use base64::Engine; // Bring the Engine trait into scope

// Scrap for desktop capture.
use scrap::{Capturer, Display};

// Reqwest and serde for HTTP requests.
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
    last_capture: u64,
    // Mouse events:
    last_mouse_press: Option<SystemTime>,
    mouse_button_pressed: bool,
    // Keyboard events:
    key_press_count: u32,
    last_key_press: Option<SystemTime>,
}

/// Global variable to hold the most recent frame (as base64 PNG).
static LATEST_FRAME: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

static RECORDING_STATE: Lazy<Mutex<RecordingState>> =
    Lazy::new(|| Mutex::new(RecordingState::default()));

//
// Tauri Commands
//

#[tauri::command]
fn start_recording() -> Result<String, String> {
    let base_folder = get_default_base_folder();
    create_recording_paths(base_folder.to_str().unwrap()).map_err(|e| e.to_string())?;
    {
        let mut state = RECORDING_STATE.lock().unwrap();
        state.active = true;
        state.verified = false;
        state.base_folder = Some(base_folder.to_str().unwrap().to_string());
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
        state.base_folder.clone().unwrap_or_else(|| get_default_base_folder().to_str().unwrap().to_string())
    };
    thread::spawn(move || {
        // Capture one screenshot immediately; label it "Init"
        if let Err(e) = capture_and_save_screenshot_with_action(base_folder.as_str(), "Init") {
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
            Ok(res) => println!("Processing complete: {:?}", res),
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
fn capture_and_save_screenshot_with_action(base_folder: &str, action: &str) -> Result<(), Box<dyn std::error::Error>> {
    let screenshot = capture_screen()?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let (_, images_dir, _, _) = create_recording_paths(base_folder)?;
    // Filename now includes the action.
    let file_path = images_dir.join(format!("raw_{}_{}.png", timestamp, action));
    screenshot.save(&file_path)?;
    let mut buffer = Cursor::new(Vec::new());
    screenshot.write_to(&mut buffer, ImageOutputFormat::Png)?;
    let encoded = STANDARD.encode(buffer.get_ref());
    let mut latest = LATEST_FRAME.lock().unwrap();
    *latest = Some(encoded);
    println!("Captured and saved screenshot: {:?}", file_path);
    Ok(())
}

/// Listens to global input events and triggers screenshot capture with action labels.
fn start_input_listeners() {
    let callback = |event: rdev::Event| {
        let now = SystemTime::now();
        let mut state = RECORDING_STATE.lock().unwrap();
        if !state.active || !state.verified {
            return;
        }
        match event.event_type {
            EventType::ButtonPress(_) => {
                state.last_mouse_press = Some(now);
                state.mouse_button_pressed = true;
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(0.5));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MousePress");
                    });
                }
            },
            EventType::ButtonRelease(_) => {
                state.mouse_button_pressed = false;
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(0.5));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MouseRelease");
                    });
                }
            },
            EventType::Wheel { delta_x: _, delta_y: _ } => {
                if let Some(folder) = state.base_folder.clone() {
                    drop(state);
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs_f32(1.0));
                        let _ = capture_and_save_screenshot_with_action(folder.as_str(), "MouseScroll");
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
                            let _ = capture_and_save_screenshot_with_action(folder.as_str(), &format!("KeyPress_{}", key_str));
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

/// Captures a screenshot using scrap, saves it, and updates LATEST_FRAME.
/// Optimized with a 50ms sleep loop when waiting for a nonblank frame.
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

/// Captures an actual screenshot of the primary display using scrap.
fn capture_screen() -> Result<DynamicImage, ImageError> {
    let display = Display::primary().map_err(|e| ImageError::IoError(e))?;
    let mut capturer = Capturer::new(display).map_err(|e| ImageError::IoError(e))?;
    let (w, h) = (capturer.width(), capturer.height());
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

/// Processes all raw screenshots by sending them to the Python endpoint,
/// adds the action (extracted from the filename) as a new column in the CSV,
/// moves the CSV into a new folder "action_{n}" inside encrypted_csv,
/// and clears any leftover raw screenshots.
fn process_recording_internal(base_folder: &str, _encryption_password: String) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let (_base, images_dir, encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    let mut results = Vec::new();
    let client = Client::builder().timeout(Duration::from_secs(120)).build()?;
    
    // Create a new action folder inside encrypted_csv.
    let mut action_index = 0;
    loop {
        let action_folder = encrypted_dir.join(format!("action_{}", action_index));
        if !action_folder.exists() {
            std::fs::create_dir_all(&action_folder)?;
            break;
        }
        action_index += 1;
    }
    let action_folder = encrypted_dir.join(format!("action_{}", action_index));
    
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
        println!("Raw image file size: {} bytes", image_bytes.len());
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
        println!("Response JSON: {:?}", json_resp);
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        
        // Extract the action from the filename.
        // Expect filename format: raw_{timestamp}_{action}.png
        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parts: Vec<&str> = file_stem.split('_').collect();
        let action = if parts.len() >= 3 {
            parts[2..].join("_")
        } else {
            "Unknown".to_string()
        };
        
        // Modify parsed CSV text by adding a new column "action".
        let parsed_csv = if let Some(parsed_content) = json_resp.get("parsed_content").and_then(|v| v.as_str()) {
            let mut lines = parsed_content.lines();
            let header = if let Some(h) = lines.next() {
                format!("{},action", h)
            } else {
                "action".to_string()
            };
            let mut new_rows = vec![header];
            for line in lines {
                new_rows.push(format!("{},{}", line, action));
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
    
    // Optionally, combine all CSV rows into one file.
    // let combined_csv = all_rows.join("\n");
    // let combined_csv_path = action_folder.join("combined_parsed_content.csv");
    // std::fs::write(&combined_csv_path, combined_csv)?;
    // results.push(format!("Combined CSV saved at {:?}", combined_csv_path));
    
    Ok(results)
}


fn summarize_recording_internal(base_folder: &str) -> Result<String, Box<dyn std::error::Error>> {
    let (_base, _images_dir, _encrypted_dir, _salt_dir) = create_recording_paths(base_folder)?;
    Ok("Dummy summary of recording".into())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_recording,
            verify_recording,
            stop_recording,
            summarize_recording,
            get_latest_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}