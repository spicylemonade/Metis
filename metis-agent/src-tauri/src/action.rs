use std::path::{Path, PathBuf};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use regex::Regex;
use csv::{Reader, Writer, WriterBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tokio::runtime::Runtime;
use crate::llm::get_llm;
use crate::RECORDING_STATE;

#[derive(Debug, Deserialize, Serialize)]
struct MainCsvRecord {
    query: String,
    location: String,
}

// fn parse_tuple(s: &str) -> Option<(i32, i32)> {
//     let nums: Vec<i32> = s
//         .trim_matches(|c| c == '(' || c == ')') // Remove parentheses
//         .split(',') // Split by comma
//         .filter_map(|num| num.trim().parse().ok()) // Parse integers
//         .collect();
//     if nums.len() == 2 {
//         match nums{
//             // some()
//             // _ => None
//         }
//     }
// }
pub fn start_action(command: String) -> Result<bool, String> {

    // Get the base folder from recording state
    let base_folder = {
        let state = RECORDING_STATE.lock().unwrap();

        match state.base_folder.clone() {
            Some(folder) => folder,
            None => return Err("Base folder not set".into()), // Base folder not set
        }
    };


    let main_csv_path = Path::new(&base_folder).join("main.csv");
    println!("{}", main_csv_path.to_str().unwrap());

    // Check if main.csv exists
    if !main_csv_path.exists() {
        return Err("main.csv does not exist in the screenshots folder".into());
    }


    // Read main.csv
    let mut rdr = match Reader::from_path(&main_csv_path) {
        Ok(rdr) => rdr,
        Err(e) => {
            return Err(format!("Failed to read main.csv: {}", e));
        }
    };


    // Parse command words for regex matching
    let command_words: Vec<&str> = command.split_whitespace().collect();
    if command_words.is_empty() {
        return Err("Empty command provided".into());
    }


    // Find matching rows in main.csv
    let mut matching_locations = HashSet::new();
    for result in rdr.deserialize() {
        let record: MainCsvRecord = match result {
            Ok(record) => record,
            Err(e) => {
                eprintln!("Error parsing main.csv: {}", e);
                continue;
            }
        };
        println!("{:#?}", record);

        // Count how many words from the command match the query
        let mut matching_words = 0;
        for word in command_words.iter() {
            println!("{}", word);

            if record.query.to_lowercase().contains(&word.to_lowercase()) {
                matching_words += 1;
            }
        }

        // If more than 3 words match, keep track of this location
        if matching_words >= 1 {
            matching_locations.insert(record.location);
        }
    }
    println!("stopper");

    if matching_locations.is_empty() {
        return Err("No matching queries found in main.csv".into());
    }
    println!("matching_locations: {:?}", matching_locations);

    // Process all CSV files in the matching locations
    let mut context = String::new();
    let encrypted_dir = Path::new(&base_folder).join("encrypted_csv");

    println!("{}", encrypted_dir.to_str().unwrap());

    for location in matching_locations {
        let location_path = encrypted_dir.join(&location);
        if !location_path.exists() || !location_path.is_dir() {
            continue;
        }

        // Read all CSV files in this location
        if let Ok(entries) = fs::read_dir(location_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();

                    if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
                        // Read CSV file content
                        if let Ok(mut file) = File::open(&path) {
                            let mut content = String::new();
                            if file.read_to_string(&mut content).is_ok() {
                                // Append to context
                                context.push_str(&format!("--- From file: {} ---\n", path.display()));
                                context.push_str(&content);
                                context.push_str("\n\n");
                            }
                        }
                    }
                }
            }
        }
    }
    println!("{}", context);
    // Check if we have any context
    if context.is_empty() {
        return Err("No CSV content found in matching locations".into());
    }

    // Create a Tokio runtime for the async LLM call
    let rt = match Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            return Err(format!("Failed to create Tokio runtime: {}", e));
        }
    };
    println!("{:?}", rt);

    // Call the LLM with context and command
    let result = rt.block_on(get_llm(context, command+": based on this data generate me one line of pure pyautogui code to do next action. format: `{code}`"));

    println!("{:#?}", result);



    match result {
        Ok(_) => {
            println!("Successfully processed action and got LLM response");
            Ok(true)
        },
        Err(e) => {
            Err(format!("Error getting LLM response: {}", e))
        }
    }
}
// fn do_action(str: String) -> Result<bool, String> {
//
// }

// Also make this function public so it can be used in main.rs
// In action.rs
pub fn create_main_csv(base_folder: &Path, action_folder: &str) -> Result<(), std::io::Error> {
    let main_csv_path = base_folder.join("main.csv");

    // Check if the file exists
    let file_exists = main_csv_path.exists();

    // If file exists, read it to find the highest default index
    let next_default_index = if file_exists {
        let mut rdr = match csv::Reader::from_path(&main_csv_path) {
            Ok(rdr) => rdr,
            Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other,
                                                     format!("Failed to read main.csv: {}", e))),
        };

        let mut highest_index = -1;
        for result in rdr.records() {
            let record = match result {
                Ok(record) => record,
                Err(_) => continue,
            };

            if record.len() >= 1 {
                let query = &record[0];
                if query.starts_with("default_") {
                    if let Ok(index) = query.trim_start_matches("default_").parse::<i32>() {
                        highest_index = std::cmp::max(highest_index, index);
                    }
                }
            }
        }

        highest_index + 1
    } else {
        // If file doesn't exist, start with default_0
        0
    };

    // Open file in append mode if it exists, or create it if it doesn't
    let file = if file_exists {
        OpenOptions::new().append(true).open(&main_csv_path)?
    } else {
        let file = File::create(&main_csv_path)?;
        // Write header for new file
        writeln!(&file, "query,location")?;
        file
    };

    // Create a writer in append mode
    let mut wtr = csv::WriterBuilder::new().has_headers(false).from_writer(file);

    // Write new record with the next default index
    let query = format!("default_{}", next_default_index);
    wtr.write_record(&[query, action_folder.to_string()])?;
    wtr.flush()?;

    Ok(())
}