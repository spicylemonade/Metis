use gemini_rs::{Client, Chat};
use tokio; // Make sure to add these dependencies in your Cargo.toml

pub async fn get_llm(context: String, query: String, client: &Client) -> Result<String, gemini_rs::Error> {
    // Initialize the client with API key from environment


    // Create a new chat instance with the desired model
    let mut chat = client.chat("gemini-2.0-flash");

    // Set the system instruction with the context
    chat = chat.system_instruction(&context);

    // Send the query message and get the response
    let response = chat.send_message(&query).await?;

    // Return the response as a String
    Ok(response.to_string())
}

// Example usage (you would call this from an async context):
/*
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let context = "You are a helpful AI assistant.".to_string();
    let query = "What is the capital of France?".to_string();

    let result = get_llm(context, query).await?;
    println!("Response: {}", result);
    Ok(())
}
*/