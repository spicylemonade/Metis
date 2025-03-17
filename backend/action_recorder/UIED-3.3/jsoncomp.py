import json
import zlib
import os

# Define a mapping for common keys to shorter aliases.
KEY_MAP = {
    "img_shape": "s",
    "compos": "c",
    "id": "i",
    "class": "cl",
    "column_min": "cm",
    "row_min": "rm",
    "column_max": "cM",
    "row_max": "rM",
    "width": "w",
    "height": "h",
    "children": "ch",
    "content": "cnt",
    "parent": "p"
}

def encode_keys(data):
    """ Recursively replace keys in dictionaries with their shorter aliases. """
    if isinstance(data, dict):
        return {KEY_MAP.get(k, k): encode_keys(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [encode_keys(item) for item in data]
    return data

def decode_keys(data):
    """ Reverse the process: map the short aliases back to the original keys. """
    reverse_map = {v: k for k, v in KEY_MAP.items()}
    if isinstance(data, dict):
        return {reverse_map.get(k, k): decode_keys(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [decode_keys(item) for item in data]
    return data

# --- Saving (Writing) the Compressed Data ---

# Load original JSON data
with open("data/output/merge2/image.json", "r") as f:
    data = json.load(f)

# Step 1: Encode the data using our key mapping.
encoded_data = encode_keys(data)

# Step 2: Serialize to a JSON string.
json_str = json.dumps(encoded_data, separators=(',', ':'))

# Save the uncompressed JSON
with open("data_minified.json", "w") as f:
    f.write(json_str)

# Step 3: Compress the JSON string.
compressed_bytes = zlib.compress(json_str.encode("utf-8"), level=9)

# Step 4: Write the compressed data to a file.
with open("data_compressed.bin", "wb") as f:
    f.write(compressed_bytes)

print("Data successfully compressed and saved to 'data_compressed.bin'.")

# --- Compare File Sizes ---
original_size = os.path.getsize("data/output/merge2/image.json")
minified_size = os.path.getsize("data_minified.json")
compressed_size = os.path.getsize("data_compressed.bin")

print(f"Original JSON file size: {original_size / 1024:.2f} KB")
print(f"Minified JSON file size: {minified_size / 1024:.2f} KB")
print(f"Compressed file size: {compressed_size / 1024:.2f} KB")

# Calculate compression ratio
minification_ratio = minified_size / original_size * 100
compression_ratio = compressed_size / original_size * 100

print(f"Minification reduced size to {minification_ratio:.2f}% of original.")
print(f"Compression reduced size to {compression_ratio:.2f}% of original.")

# --- Loading (Reading) the Compressed Data ---

# Read the compressed data from file.
with open("data_compressed.bin", "rb") as f:
    loaded_compressed_bytes = f.read()

# Decompress the data.
decompressed_str = zlib.decompress(loaded_compressed_bytes).decode("utf-8")

# Parse the JSON string back into a Python object.
loaded_encoded_data = json.loads(decompressed_str)

# Decode the keys back to the full names.
loaded_data = decode_keys(loaded_encoded_data)

# Now 'loaded_data' is equivalent to your original JSON data.
print("Data successfully loaded and decoded.")
