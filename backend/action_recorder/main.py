import io
import os
import time
import base64
import torch
import pandas as pd
import gzip
from flask import Flask, request, jsonify
from PIL import Image
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.fernet import Fernet

# Import your actual utility functions – ensure they work with a PIL image.
from util.utils import get_som_labeled_img, check_ocr_box, get_caption_model_processor, get_yolo_model


# ---------------------------------------------------------------------------
# Ensure GPU usage and set models to evaluation mode.
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using GPU: {device.type == 'cuda'}")

ICON_DETECT_MODEL_PATH = "OmniParser/weights/icon_detect_v1_5/model.pt"
ICON_CAPTION_MODEL_PATH = "OmniParser/weights/icon_caption_florence"
ICON_CAPTION_MODEL_TYPE = "florence2"

yolo_model = get_yolo_model(model_path=ICON_DETECT_MODEL_PATH)
yolo_model.to(device)
yolo_model.eval()
caption_model_processor = get_caption_model_processor(
    model_name=ICON_CAPTION_MODEL_TYPE,
    model_name_or_path=ICON_CAPTION_MODEL_PATH,
    device=device
)
print(f"Models loaded on {device}")

DEFAULT_ENCRYPTION_PASSWORD = "applebear"

# ---------------------------------------------------------------------------
# Encryption Helper Functions
# ---------------------------------------------------------------------------
def derive_key_from_password(password: str, salt: bytes, iterations: int = 100_000) -> bytes:
    password_bytes = password.encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    key = kdf.derive(password_bytes)
    return base64.urlsafe_b64encode(key)

def encrypt_data(data: bytes, password: str, salt: bytes) -> bytes:
    key = derive_key_from_password(password, salt)
    fernet = Fernet(key)
    return fernet.encrypt(data)

# ---------------------------------------------------------------------------
# Updated Image Processing Function (in-memory, no temporary file)
# ---------------------------------------------------------------------------
def process_image_file(image_input, box_threshold, iou_threshold, use_paddleocr, imgsz, icon_process_batch_size):
    """
    Processes the input PIL image entirely in memory.
    1. Converts the image to RGB if necessary.
    2. Uses an in-memory buffer to avoid writing a temporary file.
    3. Passes a PIL image to the OCR and object detection functions.
    Returns:
      - parsed_content_list: List of dicts (with fields like bounding boxes, interactivity, etc.)
      - parsed_content_str: A text summary of parsed content.
    """
    # Ensure the image is in RGB mode.
    if image_input.mode != "RGB":
        image_input = image_input.convert("RGB")
    
    # Save image to an in-memory buffer.
    buffer = io.BytesIO()
    image_input.save(buffer, format="PNG")
    buffer.seek(0)
    
    # Open a PIL image from the buffer for processing.
    image_for_processing = Image.open(buffer)
    
    # Run OCR (assumes check_ocr_box now accepts a PIL image).
    try:
        ocr_bbox_rslt, _ = check_ocr_box(
            image_for_processing,
            display_img=False,
            output_bb_format="xyxy",
            goal_filtering=None,
            easyocr_args={'paragraph': False, 'text_threshold': 0.9},
            use_paddleocr=use_paddleocr,
        )
        ocr_text, ocr_bbox = ocr_bbox_rslt
    except Exception as e:
        print("Error during OCR:", e)
        raise e

    # Run object detection and captioning.
    try:
        with torch.no_grad():
            dino_labeled_img, label_coordinates, parsed_content_list = get_som_labeled_img(
                image_for_processing,
                yolo_model,
                BOX_TRESHOLD=box_threshold,
                output_coord_in_ratio=True,
                ocr_bbox=ocr_bbox,
                draw_bbox_config={
                    'text_scale': max(image_input.size) / 3200 * 0.8,
                    'text_thickness': 1,
                    'text_padding': 1,
                    'thickness': 1,
                },
                caption_model_processor=caption_model_processor,
                ocr_text=ocr_text,
                use_local_semantics=True,
                iou_threshold=iou_threshold,
                scale_img=False,
                batch_size=icon_process_batch_size,
            )
    except Exception as e:
        print("Error during detection/captioning:", e)
        raise e

    parsed_content_str = "\n".join(
        [f"type: {x.get('type', '')}, bbox: {x.get('bbox', '')}, interactivity: {x.get('interactivity', '')}, content: {x.get('content', '')}, source: {x.get('source', '')}"
         for x in parsed_content_list]
    )
    
    return parsed_content_list, parsed_content_str

# ---------------------------------------------------------------------------
# Flask App Setup – In-memory processing (no temporary file saving)
# ---------------------------------------------------------------------------
app = Flask(__name__)

@app.route("/api/processImage", methods=["POST"])
def api_process_image():
    """
    Endpoint: POST /api/processImage
    Accepts:
      - multipart/form-data with key 'image'
      - or JSON with key 'image' containing a base64-encoded image string.
    Returns a JSON object with:
      - parsed_content: Text summary of parsed content.
      - parsed_content_table: An HTML table representation.
    """
    if 'image' in request.files:
        file = request.files['image']
        try:
            image_input = Image.open(file)
        except Exception as e:
            return jsonify({"error": f"Error opening image file: {str(e)}"}), 400
    else:
        data = request.get_json(silent=True) or {}
        image_b64 = data.get("image")
        if not image_b64:
            return jsonify({"error": "No image provided"}), 400
        try:
            image_bytes = base64.b64decode(image_b64)
            image_input = Image.open(io.BytesIO(image_bytes))
        except Exception as e:
            return jsonify({"error": f"Error decoding image: {str(e)}"}), 400

    # Processing parameters
    box_threshold = 0.05
    iou_threshold = 0.7
    use_paddleocr = True
    imgsz = 1920
    icon_process_batch_size = 128

    start = time.time()
    try:
        parsed_content_list, parsed_content_str = process_image_file(
            image_input, box_threshold, iou_threshold, use_paddleocr, imgsz, icon_process_batch_size
        )
    except Exception as e:
        return jsonify({"error": f"Processing error: {str(e)}"}), 500
    elapsed = time.time() - start
    print(f"Image processed in {elapsed:.2f} seconds.")

    # Create an HTML table from parsed content.
    df = pd.DataFrame(parsed_content_list)
    df["ID"] = range(len(df))
    df_html = df.to_html(index=False)

    response_data = {
        "parsed_content": parsed_content_str,
        "parsed_content_table": df_html
    }
    return jsonify(response_data)

# ---------------------------------------------------------------------------
# Run Flask App
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
