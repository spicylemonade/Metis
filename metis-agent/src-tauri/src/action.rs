use std::path::{Path, PathBuf};
// Removed unused PathBuf
use std::fs::{self, OpenOptions}; // Removed unused File
use std::io::{self, Write, Cursor}; // Removed unused Read and self import
use regex::Regex;
use csv::{Reader, ReaderBuilder}; // Removed unused Writer (it's only used in create_main_csv below)
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tokio::runtime::Runtime;
// Removed unused Lazy
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

// --- Enigo Imports ---
// Corrected imports based on enigo 0.3.0 docs and errors
use enigo::{Enigo, Button, Key, Keyboard, Mouse, Settings, Coordinate, Axis, Direction};
// Removed MouseButton, Wheel

// --- Network & Encoding Imports ---
use reqwest::blocking::Client;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::json;

// --- Local Imports ---
use crate::llm::get_llm;
use crate::RECORDING_STATE;
// Removed unused create_recording_paths
use crate::capture_screen; // Keep capture_screen

#[derive(Debug, Deserialize, Serialize)]
struct MainCsvRecord {
    query: String,
    location: String,
}

// --- Global State for Escape Key ---
static ACTION_INTERRUPTED: AtomicBool = AtomicBool::new(false);
static ESC_LISTENER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Starts a background thread to listen for the Escape key.
fn start_esc_listener() {
    if ESC_LISTENER_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        println!("Starting ESC listener...");
        thread::spawn(|| {
            let callback = |event: rdev::Event| {
                if let rdev::EventType::KeyPress(rdev::Key::Escape) = event.event_type {
                    println!("Escape key detected!");
                    ACTION_INTERRUPTED.store(true, Ordering::SeqCst);
                }
            };

            if let Err(error) = rdev::listen(callback) {
                eprintln!("Error starting global ESC listener: {:?}", error);
            }
            println!("ESC listener thread finished.");
            ESC_LISTENER_RUNNING.store(false, Ordering::SeqCst);
        });
    } else {
        println!("ESC listener already running.");
    }
}

/// Stops the Escape key listener (Placeholder)
fn stop_esc_listener() {
    println!("Stopping ESC listener (Note: rdev thread might persist until app exit).");
    ACTION_INTERRUPTED.store(false, Ordering::SeqCst);
}

/// Helper to parse coordinate strings like "(x,y)"
fn parse_coordinate(coord_str: &str) -> Result<(i32, i32), String> {
    // Using lazy_static or once_cell could optimize regex compilation, but fine for now
    let re = Regex::new(r"\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)").map_err(|e| e.to_string())?;
    if let Some(caps) = re.captures(coord_str) {
        let x = caps.get(1).unwrap().as_str().parse::<i32>().map_err(|e| e.to_string())?;
        let y = caps.get(2).unwrap().as_str().parse::<i32>().map_err(|e| e.to_string())?;
        Ok((x, y))
    } else {
        Err(format!("Invalid coordinate format: {}", coord_str))
    }
}

// Helper enum to distinguish between special keys and single characters
#[derive(Debug)]
enum ParsedKey {
    Key(Key),
    Char(char),
}

/// Helper to parse key strings like "'a'" or "'Shift'"
/// Returns ParsedKey::Key for special keys, ParsedKey::Char for single chars
fn parse_key(key_str: &str) -> Result<ParsedKey, String> {
    let trimmed = key_str.trim();
    if !trimmed.starts_with('\'') || !trimmed.ends_with('\'') || trimmed.len() < 3 {
        return Err(format!("Invalid key format: {}", key_str));
    }
    let key_inner = &trimmed[1..trimmed.len() - 1];

    match key_inner {
        // Map common names to Enigo Keys
        "Alt" | "alt" => Ok(ParsedKey::Key(Key::Alt)),
        "Backspace" | "backspace" => Ok(ParsedKey::Key(Key::Backspace)),
        "CapsLock" | "capslock" => Ok(ParsedKey::Key(Key::CapsLock)),
        "Control" | "ctrl" | "control" => Ok(ParsedKey::Key(Key::Control)),
        "Delete" | "del" | "delete" => Ok(ParsedKey::Key(Key::Delete)),
        "DownArrow" | "down" => Ok(ParsedKey::Key(Key::DownArrow)),
        "End" | "end" => Ok(ParsedKey::Key(Key::End)),
        "Escape" | "esc" => Ok(ParsedKey::Key(Key::Escape)),
        "F1" => Ok(ParsedKey::Key(Key::F1)), "F2" => Ok(ParsedKey::Key(Key::F2)), "F3" => Ok(ParsedKey::Key(Key::F3)),
        "F4" => Ok(ParsedKey::Key(Key::F4)), "F5" => Ok(ParsedKey::Key(Key::F5)), "F6" => Ok(ParsedKey::Key(Key::F6)),
        "F7" => Ok(ParsedKey::Key(Key::F7)), "F8" => Ok(ParsedKey::Key(Key::F8)), "F9" => Ok(ParsedKey::Key(Key::F9)),
        "F10" => Ok(ParsedKey::Key(Key::F10)), "F11" => Ok(ParsedKey::Key(Key::F11)), "F12" => Ok(ParsedKey::Key(Key::F12)),
        "Home" | "home" => Ok(ParsedKey::Key(Key::Home)),
        "LeftArrow" | "left" => Ok(ParsedKey::Key(Key::LeftArrow)),
        "Meta" | "meta" | "win" | "cmd" | "command" => Ok(ParsedKey::Key(Key::Meta)),
        "Option" | "option" => Ok(ParsedKey::Key(Key::Option)),
        "PageDown" | "pagedown" => Ok(ParsedKey::Key(Key::PageDown)),
        "PageUp" | "pageup" => Ok(ParsedKey::Key(Key::PageUp)),
        "Return" | "return" | "Enter" | "enter" => Ok(ParsedKey::Key(Key::Return)),
        "RightArrow" | "right" => Ok(ParsedKey::Key(Key::RightArrow)),
        "Shift" | "shift" => Ok(ParsedKey::Key(Key::Shift)),
        "Space" | "space" | " " => Ok(ParsedKey::Key(Key::Space)),
        "Tab" | "tab" => Ok(ParsedKey::Key(Key::Tab)),
        "UpArrow" | "up" => Ok(ParsedKey::Key(Key::UpArrow)),
        // Handle single characters - return as Char
        s if s.chars().count() == 1 => {
            Ok(ParsedKey::Char(s.chars().next().unwrap()))
        },
        _ => Err(format!("Unknown or unsupported key: '{}'", key_inner)),
    }
}


/// Executes a single action based on the input string.
/// Returns Ok(true) to continue, Ok(false) for "done", Err on failure.
fn do_action(action_str: &str, enigo: &mut Enigo) -> Result<bool, String> {
    println!("Executing action: {}", action_str);
    let parts: Vec<&str> = action_str.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid action format: {}", action_str));
    }
    let action_type = parts[0];
    let value_str = parts[1];

    match action_type {
        "click" => {
            let (x, y) = parse_coordinate(value_str)?;
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
            // Use Button::Left instead of MouseButton::Left
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "click_down" => {
            let (x, y) = parse_coordinate(value_str)?;
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
            enigo.button(Button::Left, Direction::Press).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "click_up" => {
            if value_str != "nil" {
                eprintln!("Warning: click_up value is ignored, expected 'nil', got '{}'", value_str);
            }
            enigo.button(Button::Left, Direction::Release).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "drag" => {
            let (x, y) = parse_coordinate(value_str)?;
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "tap" => {
            match parse_key(value_str)? {
                ParsedKey::Key(key) => enigo.key(key, Direction::Click).map_err(|e| e.to_string())?,
                ParsedKey::Char(c) => enigo.text(&c.to_string()).map_err(|e| e.to_string())?, // Use text for single chars
            }
            Ok(true)
        }
        "tap_down" => {
            match parse_key(value_str)? {
                ParsedKey::Key(key) => enigo.key(key, Direction::Press).map_err(|e| e.to_string())?,
                // tap_down doesn't make sense for text(), only for specific keys. Error? Or press equivalent char?
                // Let's treat single char tap_down/up as an error for now, as enigo.text() is atomic type.
                ParsedKey::Char(c) => return Err(format!("'tap_down' action is not supported for single character '{}'. Use specific Key names like 'Shift'.", c)),
            }
            Ok(true)
        }
        "tap_up" => {
            match parse_key(value_str)? {
                ParsedKey::Key(key) => enigo.key(key, Direction::Release).map_err(|e| e.to_string())?,
                ParsedKey::Char(c) => return Err(format!("'tap_up' action is not supported for single character '{}'. Use specific Key names like 'Shift'.", c)),
            }
            Ok(true)
        }
        "scroll" => {
            let units = value_str.parse::<i32>().map_err(|e| format!("Invalid scroll value: {}. {}", value_str, e))?;
            // Use enigo.scroll with Axis::Vertical instead of enigo.wheel
            enigo.scroll(units, Axis::Vertical).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "type" => {
            let trimmed = value_str.trim();
            if !trimmed.starts_with('\'') || !trimmed.ends_with('\'') || trimmed.len() < 2 {
                return Err(format!("Invalid type format: {}", value_str));
            }
            let text_to_type = &trimmed[1..trimmed.len() - 1];
            enigo.text(text_to_type).map_err(|e| e.to_string())?;
            Ok(true)
        }
        "done" => {
            let trimmed = value_str.trim();
            let done_message = if trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2 {
                &trimmed[1..trimmed.len() - 1]
            } else {
                trimmed
            };
            println!("Action loop finished: {}", done_message);
            Ok(false)
        }
        _ => Err(format!("Unknown action type: {}", action_type)),
    }
}


/// Captures screen, sends to Python backend, returns CSV content.
fn get_screen_csv() -> Result<String, String> {
    println!("Capturing screen for CSV conversion...");
    let screenshot = capture_screen().map_err(|e| format!("Screen capture failed: {}", e))?;

    let mut buffer = Cursor::new(Vec::new());
    screenshot.write_to(&mut buffer, image::ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to write PNG to buffer: {}", e))?;

    let image_base64 = STANDARD.encode(buffer.get_ref());

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let payload = json!({ "image": image_base64 });

    println!("Sending image to Python backend...");
    let resp = client
        .post("http://localhost:5001/api/processImage")
        .json(&payload)
        .send()
        .map_err(|e| format!("Failed to send request to Python backend: {}", e))?;

    // --- Fix for E0382 ---
    // Get status *before* consuming the body with .text() or .json()
    let status = resp.status();
    println!("Received response status: {}", status);

    if !status.is_success() {
        // Now consume the body safely to get the error message
        let error_body = resp.text().unwrap_or_else(|_| "Could not read error body".to_string());
        // Use the stored status variable
        return Err(format!("Python backend returned error {}: {}", status, error_body));
    }
    // --- End Fix ---

    // Consume body to get JSON
    let json_resp: serde_json::Value = resp.json()
        .map_err(|e| format!("Failed to parse JSON response from Python backend: {}", e))?;

    if let Some(parsed_content) = json_resp.get("parsed_content").and_then(|v| v.as_str()) {
        println!("Successfully received CSV data from backend.");
        Ok(parsed_content.to_string())
    } else {
        Err("Python backend response missing 'parsed_content' field or it's not a string".to_string())
    }
}


// Renamed from start_action - This is the main loop controller
pub fn execute_task_loop(initial_command: String) -> Result<String, String> {
    let mut start_string: String = String::from("");
    let client = gemini_rs::Client::new(
        std::env::var("GEMINI_API_KEY")
            .expect("GEMINI_API_KEY environment variable not set")
    );
    println!("Starting action loop for command: {}", initial_command);
    ACTION_INTERRUPTED.store(false, Ordering::SeqCst);
    start_esc_listener();

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    // --- Determine Base Folder ---
    let base_folder_path: PathBuf; // Use PathBuf for easier joining
    { // Scope for the mutex lock
        let mut state = RECORDING_STATE.lock().unwrap(); // Lock mutably to potentially update state
        if let Some(folder_str) = &state.base_folder {
            // If already set in state (e.g., from start_recording), use it
            base_folder_path = PathBuf::from(folder_str);
            println!("Using base folder from state: {}", base_folder_path.display());
        } else {
            // If not set, determine the default path NOW
            println!("Base folder not set in state, determining default...");
            // Ensure get_default_base_folder is accessible here!
            // Use crate::get_default_base_folder() if it's in main.rs
            let default_folder = crate::get_default_base_folder();

            // --- Crucial Check: Does the default folder *exist*? ---
            // While execute_task_loop *needs* it, main.csv might not exist yet.
            // Let's proceed but handle downstream errors (like missing main.csv)
            println!("Using default base folder: {}", default_folder.display());

            // Optionally store it back in the state for this session
            // This avoids recalculating if execute_task_loop is somehow called multiple times
            state.base_folder = Some(default_folder.to_string_lossy().into_owned());
            base_folder_path = default_folder;
        }
    } // Mutex lock released here
    // --- End Determine Base Folder ---


    // Now use base_folder_path (PathBuf) instead of base_folder (String)
    let main_csv_path = base_folder_path.join("main.csv");
    let encrypted_dir = base_folder_path.join("encrypted_csv");

    // Add check for main.csv existence here, using the determined path
    if !main_csv_path.exists() {
        stop_esc_listener();
        return Err(format!(
            "main.csv does not exist in the expected folder: {}",
            main_csv_path.display()
        ));
    }


    println!("Base folder path being used: {}", base_folder_path.display());
    println!("Main CSV path: {}", main_csv_path.display());
    println!("Encrypted CSV dir: {}", encrypted_dir.display());



    // --- 1. Find related context from main.csv based on initial_command ---
    if !main_csv_path.exists() {
        stop_esc_listener(); // Stop listener if we exit early
        return Err("main.csv does not exist in the base folder".into());
    }
    let mut rdr = ReaderBuilder::new().has_headers(true).from_path(&main_csv_path)
        .map_err(|e| format!("Failed to read main.csv: {}", e))?;

    let command_words: Vec<&str> = initial_command.split_whitespace().collect();
    let mut matching_locations = HashSet::new();

    #[derive(Debug, Deserialize)] // Define struct locally if not already globally available
    struct MainCsvRecordForLoop {
        query: String,
        location: String,
    }

    for result in rdr.deserialize::<MainCsvRecordForLoop>() { // Specify type for deserialization
        let record = match result {
            Ok(record) => record,
            Err(e) => { eprintln!("Error parsing main.csv record: {}", e); continue; }
        };
        let mut matching_words = 0;
        for word in command_words.iter() {
            if record.query.to_lowercase().contains(&word.to_lowercase()) {
                matching_words += 1;
            }
        }
        // Adjust matching threshold if needed (e.g., >= 1 for any overlap)
        if matching_words >= 1 {
            matching_locations.insert(record.location);
        }
    }

    if matching_locations.is_empty() {
        println!("Warning: No matching historical queries found in main.csv for '{}'. Proceeding with current screen only.", initial_command);
    } else {
        println!("Found related historical action folders: {:?}", matching_locations);
    }


    // --- 2. Gather historical context from matched folders ---
    let mut historical_context = String::new();
    for location in matching_locations {
        let location_path = encrypted_dir.join(&location);
        if location_path.is_dir() {
            match fs::read_dir(location_path) {
                Ok(entries) => {
                    for entry in entries.filter_map(Result::ok) {
                        let path = entry.path();
                        if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
                            match fs::read_to_string(&path) {
                                Ok(content) => {
                                    historical_context.push_str(&format!("--- Context from {} ---\n", path.display()));
                                    historical_context.push_str(&content);
                                    historical_context.push_str("\n\n");
                                },
                                Err(e) => eprintln!("Warning: Failed to read context file {}: {}", path.display(), e)
                            }
                        }
                    }
                },
                Err(e) => eprintln!("Warning: Failed to read directory for location {}: {}", location, e)
            }
        } else {
            eprintln!("Warning: Matching location folder not found or not a directory: {}", location);
        }
    }

    // Create Tokio runtime for asynchronous LLM calls
    let rt = Runtime::new().map_err(|e| format!("Failed to create Tokio runtime: {}", e))?;

    // --- 3. Start the Action Loop ---
    let mut loop_count = 0;
    loop {
        println!("\n--- Action Loop Iteration {} ---", loop_count);

        // Check for ESC key interruption *before* doing work
        if ACTION_INTERRUPTED.load(Ordering::SeqCst) {
            println!("Action loop interrupted by user (Escape key).");
            stop_esc_listener(); // Stop listener on interruption
            return Err("Action interrupted by user.".to_string());
        }

        // --- 3a. Get Current Screen State as CSV ---
        let current_screen_csv = match get_screen_csv() {
            Ok(csv) => csv,
            Err(e) => {
                eprintln!("Failed to get current screen CSV: {}", e);
                // Decide how to handle this: retry, skip, or abort? Aborting for now.
                stop_esc_listener(); // Stop listener on error
                return Err(format!("Failed to get current screen CSV: {}", e));
            }
        };

        // --- 3b. Combine Context ---
        let mut combined_context = String::new();
        combined_context.push_str("--- Current Screen State ---\n");
        combined_context.push_str(&current_screen_csv);
        combined_context.push_str("\n\n");

        if !historical_context.is_empty() {
            combined_context.push_str("--- Relevant Historical Actions ---\n");
            combined_context.push_str(&historical_context);
        } else {
            combined_context.push_str("--- No Relevant Historical Actions Found ---\n");
        }


        // --- 3c. Prepare Prompt and Call LLM ---
        // Updated prompt to request thought process and action
        let llm_prompt = format!(
            // Start with the user's command
            "The command given to you was: {initial_command}\n\n\
             Previous actions: {start_string}\n
             Below is the Current Screen State (as CSV data with columns including id, class, column_min, rhello hows it goinnghexa ow_min, column_max, row_max, width, height, content) and may include Relevant Historical Actions:\n\n{combined_context}\n\n\
             Based on this information, perform the following steps:\n\
             1. First, provide a brief explanation (1-3 sentences) of your reasoning and the intended action, enclosed within <think></think> tags. Refer to element details (like id, class, content, or coordinates) from the CSV context in your reasoning.\n\
             2. Immediately following the closing </think> tag, provide the single next action command using the exact format specified below.\n\n\
             Valid action commands and their required value formats:\n\
             * `click:(x,y)` - Click instantly at absolute pixel coordinates (x, y). Derive coordinates from the CSV data (e.g., center of a bbox: ((col_min+col_max)/2, (row_min+row_max)/2)).\n\
             * `click_down:(x,y)` - Press and hold the left mouse button at absolute pixel coordinates (x, y).\n\
             * `click_up:nil` - Release the held left mouse button. The value must be exactly `nil`.\n\
             * `drag:(x,y)` - Move the mouse to absolute pixel coordinates (x, y) WHILE the button is held down (use after `click_down`).\n\
             * `tap:'key'` - Press and release a keyboard key. The key name or character MUST be enclosed in single quotes. Common keys: 'a', 'b', '1', 'Enter', 'Shift', 'Control', 'Alt', 'Escape', 'Backspace', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F5', etc.\n\
             * `tap_down:'key'` - Press and HOLD a keyboard key (typically for modifiers like 'Shift', 'Control', 'Alt'). Use single quotes.\n\
             * `tap_up:'key'` - Release a held keyboard key. Use single quotes.\n\
             * `scroll:amount` - Scroll vertically by the specified integer `amount`. Positive values scroll down, negative values scroll up. Example: `scroll:10`, `scroll:-5`.\n\
             * `type:'text to type'` - Type the provided sequence of characters exactly. The text MUST be enclosed in single quotes.\n\
             * `done:'completion message'` - Stop the execution loop and report the outcome. The message MUST be enclosed in single quotes.\n\n\
             Examples of the required output format:\n\
             <think>User wants to log in. I see a button component (id: 5, class: Compo, row_min: 250, col_min: 100, row_max: 280, col_max: 150, content: 'Login'). I will click its approximate center.</think>click:(125,265)\n\
             <think>The input field (id: 3, class: Compo, row_min: 100, col_min: 80, row_max: 120, col_max: 280) seems to be for the username based on nearby text. I will type 'testuser'.</think>type:'testuser'\n\
             <think>The required information is below the current view. I need to scroll down the page significantly.</think>scroll:15\n\
             <think>I see the text 'Welcome, testuser!' (id: 12, class: Text). The login was successful, fulfilling the command.</think>done:'Login successful.'\n\n\
             Your Response:", // The comma separating format string from arguments comes AFTER the whole string

            // Variables to substitute (using named arguments)
            initial_command = initial_command,
            combined_context = combined_context
        );

        println!("Sending prompt to LLM...");
        // Optional: Log part of the prompt for debugging
        // println!("LLM Prompt (start): {}", &llm_prompt[..std::cmp::min(llm_prompt.len(), 500)]);

        // Call the LLM asynchronously within the Tokio runtime
        let llm_result = rt.block_on(get_llm(llm_prompt, initial_command.clone(),&client)); // Pass refined prompt


        // --- 3d. Parse LLM Response and Extract Action ---
        let (thought_process, action_to_perform) = match llm_result {
            Ok(response) => {
                println!("Raw LLM Response: {}", response);
                start_string.push_str(&response);

                // Find the closing tag
                let think_end_tag = "</think>";
                if let Some(end_tag_index) = response.find(think_end_tag) {
                    // Extract thought process (optional, but good for logging)
                    let think_start_tag = "<think>";
                    let thought = if let Some(start_tag_index) = response.find(think_start_tag) {
                        if start_tag_index < end_tag_index {
                            response[start_tag_index + think_start_tag.len()..end_tag_index].trim()
                        } else {
                            eprintln!("Warning: Found <think> tag after </think> tag.");
                            ""
                        }
                    } else {
                        eprintln!("Warning: Found </think> tag but no matching <think> tag.");
                        ""
                    };

                    // Extract the action part after the tag
                    let action_part = response[end_tag_index + think_end_tag.len()..].trim();

                    println!("LLM Thought: {}", thought);
                    if action_part.is_empty() {
                        eprintln!("Error: LLM response had </think> tag but no action followed.");
                        stop_esc_listener(); // Stop listener on error
                        return Err("LLM returned thought but no action.".to_string());
                    }
                    (thought.to_string(), action_part.to_string())

                } else {
                    // Fallback: No </think> tag found, assume entire response is the action
                    eprintln!("Warning: LLM response did not contain '</think>' tag. Assuming entire response is the action.");
                    let action_part = response.trim();
                    if action_part.is_empty() {
                        eprintln!("Error: LLM response was empty.");
                        stop_esc_listener(); // Stop listener on error
                        return Err("LLM returned an empty response.".to_string());
                    }
                    ("".to_string(), action_part.to_string()) // Empty thought, full response as action
                }
            }
            Err(e) => {
                eprintln!("Error getting LLM response: {}", e);
                stop_esc_listener(); // Stop listener on error
                return Err(format!("Error getting LLM response: {}", e));
            }
        };

        println!("Action to Perform: {}", action_to_perform);

        // --- 3e. Execute Action ---
        if action_to_perform.is_empty() {
            // Should be caught earlier now, but keep as safety check
            eprintln!("Extracted action is empty. Stopping.");
            stop_esc_listener(); // Stop listener on error
            return Err("Extracted action was empty.".to_string());
        }

        match do_action(&action_to_perform, &mut enigo) {
            Ok(true) => {
                // Action successful, continue loop
                println!("Action successful. Continuing loop.");
                // Small delay after action to allow UI to update before next capture
                thread::sleep(Duration::from_millis(500)); // Adjust delay as needed
            }
            Ok(false) => {
                // "done" action received, exit loop successfully
                println!("'done' action received. Exiting loop.");
                println!("Final thought before done: {}", thought_process); // Log final thought
                stop_esc_listener(); // Stop listener on successful completion
                let message = action_to_perform.splitn(2, ':').nth(1).unwrap_or("Done").trim_matches('\'');
                return Ok(format!("Task completed: {}", message));
            }
            Err(e) => {
                // Error executing action
                eprintln!("Error executing action '{}': {}", action_to_perform, e);
                eprintln!("Thought process leading to error: {}", thought_process); // Log thought on error
                stop_esc_listener(); // Stop listener on error
                return Err(format!("Error executing action '{}': {}", action_to_perform, e));
            }
        }

        // --- 3f. Loop Increment and Safety Break ---
        loop_count += 1;
        // Adjust max iterations as needed
        const MAX_ITERATIONS: u32 = 100;
        if loop_count > MAX_ITERATIONS {
            eprintln!("Action loop reached maximum iterations ({}). Stopping.", MAX_ITERATIONS);
            stop_esc_listener(); // Stop listener on loop break
            return Err("Loop safety break triggered.".to_string());
        }
    }
    // Note: The loop should only be exited via return statements inside it (Ok or Err)
}


// --- create_main_csv function (Keep as is, ensure csv crate is available) ---
// Requires csv crate
pub fn create_main_csv(base_folder: &Path, action_folder: &str) -> Result<(), std::io::Error> {
    let main_csv_path = base_folder.join("main.csv");
    let file_exists = main_csv_path.exists();

    let next_default_index = if file_exists {
        let mut rdr = match csv::Reader::from_path(&main_csv_path) {
            Ok(rdr) => rdr,
            Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other,
                                                     format!("Failed to read main.csv: {}", e))),
        };
        let mut highest_index = -1;
        for result in rdr.records() {
            if let Ok(record) = result {
                if record.len() >= 1 {
                    let query = &record[0];
                    if query.starts_with("default_") {
                        if let Ok(index) = query.trim_start_matches("default_").parse::<i32>() {
                            highest_index = std::cmp::max(highest_index, index);
                        }
                    }
                }
            }
        }
        highest_index + 1
    } else {
        0
    };

    let needs_header = !file_exists;
    // Use std::fs::File here
    let file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&main_csv_path)?;

    // Ensure csv::Writer is imported if using create_main_csv
    // Requires `use csv::WriterBuilder;` or `use csv::Writer;` depending on usage pattern
    // Using WriterBuilder is generally preferred. Let's assume it's available or add `use csv::WriterBuilder;`
    let mut wtr = csv::WriterBuilder::new()
        .has_headers(needs_header)
        .from_writer(file);

    if needs_header {
        wtr.write_record(&["query", "location"])?;
    }

    let query = format!("default_{}", next_default_index);
    wtr.write_record(&[&query, action_folder])?;
    wtr.flush()?;

    Ok(())
}