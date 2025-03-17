import io
import os
import time
import base64
import cv2
import json
import traceback
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from PIL import Image
from os.path import join as pjoin

# =============================
# Configuration Variables
# =============================
USE_EASYOCR = False  # False = Use Tesseract, True = Use EasyOCR
DRAW_BOUNDING_BOXES = False  # Whether to draw bounding boxes on output image
SAVE_MERGED_IMAGE = True  # Whether to save the merged visualization
OUTPUT_ROOT = 'data/output'  # Root directory for output files

# Create output directory if it doesn't exist
os.makedirs(OUTPUT_ROOT, exist_ok=True)

# =============================
# Conditional Imports
# =============================
try:
    if USE_EASYOCR:
        import easyocr
        print("Successfully imported EasyOCR")
    else:
        import pytesseract
        from pytesseract import Output
        print("Successfully imported pytesseract")
except ImportError as e:
    print(f"Warning: OCR libraries not available: {e}")
    print("Will use basic image analysis without OCR")

# Try to import OpenCV for image processing
try:
    import cv2
    print("Successfully imported OpenCV")
    HAVE_OPENCV = True
except ImportError:
    print("Warning: OpenCV not available")
    HAVE_OPENCV = False

# Advanced component detection using OpenCV
class ImprovedComponentDetector:
    @staticmethod
    def detect_ui_components(image):
        """
        Detect UI components using OpenCV image processing techniques

        Args:
            image: NumPy array in BGR format

        Returns:
            List of component dictionaries with position and size
        """
        if not HAVE_OPENCV:
            return []

        components = []
        try:
            # Convert to grayscale for processing
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            height, width = gray.shape

            # Apply binary thresholding
            _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)

            # Detect edges
            edges = cv2.Canny(binary, 50, 150)

            # Dilate to connect edges
            kernel = np.ones((5, 5), np.uint8)
            dilated = cv2.dilate(edges, kernel, iterations=2)

            # Find contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            # Process contours into components
            min_area = 1000  # Minimum area to consider as a component
            id_counter = 0

            # Add the full screen as a component
            components.append({
                "id": id_counter,
                "class": "Compo",
                "column_min": 0,
                "row_min": 0,
                "column_max": width,
                "row_max": height,
                "width": width,
                "height": height
            })
            id_counter += 1

            # Process contours
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > min_area:
                    x, y, w, h = cv2.boundingRect(contour)

                    # Skip if this is almost the entire screen
                    if w > width * 0.9 and h > height * 0.9:
                        continue

                    components.append({
                        "id": id_counter,
                        "class": "Compo",
                        "column_min": x,
                        "row_min": y,
                        "column_max": x + w,
                        "row_max": y + h,
                        "width": w,
                        "height": h
                    })
                    id_counter += 1

            print(f"Detected {len(components)} UI components")
            return components
        except Exception as e:
            print(f"Error in component detection: {e}")
            traceback.print_exc()
            return [{
                "id": 0,
                "class": "Compo",
                "column_min": 0,
                "row_min": 0,
                "column_max": width,
                "row_max": height,
                "width": width,
                "height": height
            }]

    @staticmethod
    def compo_detection(image_path, output_root, params, classifier=None, resize_by_height=None, show=False):
        """
        Compatibility method for the old interface

        Args:
            image_path: Path to the image file
            output_root: Root directory for output
            params: Detection parameters
            classifier: Optional classifier
            resize_by_height: Optional height for resizing
            show: Whether to show the image

        Returns:
            Path to the generated JSON file
        """
        # Read the image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image from {image_path}")

        height, width, _ = img.shape

        # Detect components
        components = ImprovedComponentDetector.detect_ui_components(img)

        # Create the output structure
        result = {
            "img_shape": [height, width, 3],
            "compos": components
        }

        # Save the JSON result
        base_name = os.path.basename(image_path).split('.')[0]
        output_path = pjoin(output_root, 'ip', f"{base_name}.json")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(result, f, indent=4)

        return output_path

# Use improved component detector if OpenCV is available, otherwise use the mock
if HAVE_OPENCV:
    ip = ImprovedComponentDetector
    print("Using improved component detector with OpenCV")
else:
    # Keep using our mock detector if OpenCV is not available
    print("Using mock component detector (OpenCV not available)")

# =============================
# Helper Functions
# =============================
def resize_height_by_longest_edge(image, resize_length=800):
    """
    Resize an image by its longest edge to the specified length.
    Accepts a PIL Image or a NumPy array.
    """
    if isinstance(image, Image.Image):
        width, height = image.size
    else:  # Assume NumPy array
        height, width = image.shape[:2]

    if height > width:
        return resize_length
    else:
        return int(resize_length * (height / width))

def build_hierarchy_and_reassign_ids(elements):
    """
    1) Reassign all element IDs (Compo & Text) to ensure uniqueness.
    2) Build hierarchy: any 'Text' that is inside a 'Compo' becomes a child of that 'Compo'.
    """
    # Remove any previous parent/children info.
    for ele in elements:
        ele.pop('parent', None)
        ele.pop('children', None)

    # Assign new IDs sequentially.
    for i, ele in enumerate(elements):
        ele['id'] = i

    # Add empty children lists to all UI components (class 'Compo').
    for ele in elements:
        if ele['class'] == 'Compo':
            ele['children'] = []

    # For each Text element, check if its bounding box is contained within any UI component.
    def is_contained(inner, outer):
        return (inner['column_min'] >= outer['column_min'] and
                inner['row_min'] >= outer['row_min'] and
                inner['column_max'] <= outer['column_max'] and
                inner['row_max'] <= outer['row_max'])

    for txt in elements:
        if txt['class'] != 'Text':
            continue
        for comp in elements:
            if comp['class'] == 'Compo':
                if is_contained(txt, comp):
                    comp['children'].append(txt['id'])
                    txt['parent'] = comp['id']
                    break  # assign to the first matching UI component
    return elements

def process_ocr(image):
    """
    Extract text using OCR from the image.

    Args:
        image: NumPy array image in BGR format (OpenCV format)

    Returns:
        Dictionary with image shape and extracted texts
    """
    h, w = image.shape[:2]

    ocr_output = {
        "img_shape": [h, w, 3],
        "texts": []
    }

    try:
        if USE_EASYOCR:
            try:
                # Use EasyOCR for OCR processing
                reader = easyocr.Reader(['en'])
                results = reader.readtext(image)

                for i, (bbox, text, conf) in enumerate(results):
                    if conf > 0.4:  # Only include reasonably confident results
                        xs = [point[0] for point in bbox]
                        ys = [point[1] for point in bbox]
                        ocr_output["texts"].append({
                            "id": i,
                            "column_min": int(min(xs)),
                            "row_min": int(min(ys)),
                            "column_max": int(max(xs)),
                            "row_max": int(max(ys)),
                            "content": text
                        })
                print(f"EasyOCR found {len(ocr_output['texts'])} text elements")
            except Exception as e:
                print(f"EasyOCR failed: {e}")
                traceback.print_exc()
        else:
            try:
                # Use pytesseract for OCR processing
                ocr_data = pytesseract.image_to_data(image, output_type=Output.DICT)
                n_boxes = len(ocr_data['text'])
                text_count = 0

                for i in range(n_boxes):
                    text = ocr_data['text'][i].strip()
                    try:
                        conf_val = float(ocr_data['conf'][i])
                    except ValueError:
                        conf_val = 0

                    if text != "" and conf_val > 0:
                        left = ocr_data['left'][i]
                        top = ocr_data['top'][i]
                        width_box = ocr_data['width'][i]
                        height_box = ocr_data['height'][i]
                        ocr_output["texts"].append({
                            "id": text_count,
                            "column_min": left,
                            "row_min": top,
                            "column_max": left + width_box,
                            "row_max": top + height_box,
                            "content": text
                        })
                        text_count += 1
                print(f"Tesseract OCR found {text_count} text elements")
            except Exception as e:
                print(f"Tesseract OCR failed: {e}")
                traceback.print_exc()
                # Fall back to basic image analysis if both OCR methods fail
                texts = detect_text_regions_basic(image)
                ocr_output["texts"] = texts
    except Exception as e:
        print(f"OCR processing failed completely: {e}")
        traceback.print_exc()

    # If no text was found by OCR, try basic image analysis
    if len(ocr_output["texts"]) == 0:
        try:
            if HAVE_OPENCV:
                print("No text found by OCR, attempting basic text region detection")
                texts = detect_text_regions_basic(image)
                ocr_output["texts"] = texts
            else:
                print("No OCR results and OpenCV not available, using fallback text")
                # Add fallback text elements
                ocr_output["texts"] = [
                    {
                        "id": 0,
                        "column_min": 20,
                        "row_min": 20,
                        "column_max": 200,
                        "row_max": 50,
                        "content": "Text Region 1"
                    },
                    {
                        "id": 1,
                        "column_min": 20,
                        "row_min": 100,
                        "column_max": 300,
                        "row_max": 130,
                        "content": "Text Region 2"
                    }
                ]
        except Exception as e:
            print(f"Basic text detection failed: {e}")
            traceback.print_exc()

    return ocr_output

def detect_text_regions_basic(image):
    """
    Basic detection of potential text regions in an image using OpenCV

    Args:
        image: NumPy array in BGR format

    Returns:
        List of dictionaries representing text regions
    """
    texts = []
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Apply binary thresholding
        _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)

        # Apply morphological operations to find text-like regions
        kernel = np.ones((3, 10), np.uint8)  # Horizontal kernel to connect letter regions
        morph = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        # Find contours
        contours, _ = cv2.findContours(morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter contours that might be text
        id_counter = 0
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)

            # Filter by aspect ratio and size
            aspect_ratio = w / h
            if 1.2 < aspect_ratio < 20 and w > 30 and h > 8 and h < 100:
                region_img = gray[y:y+h, x:x+w]

                # Check for variation in pixel values (text usually has high variance)
                if np.std(region_img) > 20:
                    texts.append({
                        "id": id_counter,
                        "column_min": x,
                        "row_min": y,
                        "column_max": x + w,
                        "row_max": y + h,
                        "content": f"Detected Text Region {id_counter+1}"
                    })
                    id_counter += 1

        print(f"Basic text detection found {len(texts)} potential text regions")
    except Exception as e:
        print(f"Error in basic text detection: {e}")
        traceback.print_exc()

    return texts

def run_component_detection(image):
    """
    Run UI component detection on the image.

    Args:
        image: PIL Image or NumPy array

    Returns:
        Path to the generated JSON file with component information
    """
    try:
        # Create a temporary file to save the image
        os.makedirs(pjoin(OUTPUT_ROOT, 'temp'), exist_ok=True)
        os.makedirs(pjoin(OUTPUT_ROOT, 'ip'), exist_ok=True)

        # Generate a unique filename using timestamp
        timestamp = int(time.time() * 1000)
        temp_img_path = pjoin(OUTPUT_ROOT, 'temp', f'temp_image_{timestamp}.png')

        print(f"Saving temporary image to {temp_img_path}")

        if isinstance(image, Image.Image):
            image.save(temp_img_path)
        else:
            cv2.imwrite(temp_img_path, image)

        # Define key parameters for component detection
        key_params = {
            'min-grad': 10,
            'ffl-block': 5,
            'min-ele-area': 50,
            'merge-contained-ele': True,
            'merge-line-to-paragraph': False,
            'remove-bar': True
        }

        # Get resized height for component detection
        resized_height = resize_height_by_longest_edge(image, resize_length=800)

        # Use our mock component detector
        output_path = ip.compo_detection(
            temp_img_path,
            OUTPUT_ROOT,
            key_params,
            classifier=None,
            resize_by_height=resized_height,
            show=False
        )

        print(f"Component detection complete, output at {output_path}")

        # Return path to the generated JSON file
        return output_path

    except Exception as e:
        print(f"Error in component detection: {e}")
        traceback.print_exc()

        # Create a fallback JSON with basic components
        if isinstance(image, Image.Image):
            width, height = image.size
        else:
            height, width = image.shape[:2]

        fallback_json = {
            "img_shape": [height, width, 3],
            "compos": [
                {
                    "id": 0,
                    "class": "Compo",
                    "column_min": 0,
                    "row_min": 0,
                    "column_max": width,
                    "row_max": height,
                    "width": width,
                    "height": height
                }
            ]
        }

        fallback_path = pjoin(OUTPUT_ROOT, 'ip', f'fallback_{int(time.time())}.json')
        os.makedirs(os.path.dirname(fallback_path), exist_ok=True)

        with open(fallback_path, 'w') as f:
            json.dump(fallback_json, f, indent=4)

        print(f"Created fallback component JSON at {fallback_path}")
        return fallback_path

def combine_compos_and_texts(image, compo_json_path, ocr_data):
    """
    Combines UI component bounding boxes and OCR text bounding boxes,
    builds a hierarchical structure

    Args:
        image: Original image (NumPy array)
        compo_json_path: Path to the component JSON file
        ocr_data: OCR data dictionary

    Returns:
        Dict containing combined data
        List of parsed content items
    """
    try:
        # Load component JSON
        with open(compo_json_path, 'r') as f:
            compo_json = json.load(f)

        compo_img_shape = compo_json['img_shape']  # e.g., [height, width, 3]
        text_img_shape = ocr_data['img_shape']   # e.g., [height, width, 3]

        combined_eles = []

        # Copy UI component bounding boxes from compo_json
        for compo in compo_json['compos']:
            ele = {
                'id': compo.get('id', None),
                'class': compo.get('class', 'Compo'),
                'column_min': compo['column_min'],
                'row_min': compo['row_min'],
                'column_max': compo['column_max'],
                'row_max': compo['row_max'],
                'width': compo['width'],
                'height': compo['height']
            }
            if 'text_content' in compo:
                ele['text_content'] = compo['text_content']
            if 'children' in compo:
                ele['children'] = compo['children']
            if 'parent' in compo:
                ele['parent'] = compo['parent']
            combined_eles.append(ele)

        # Compute scaling ratios if the image sizes differ
        if compo_img_shape != text_img_shape:
            ratio_h = compo_img_shape[0] / text_img_shape[0]
            ratio_w = compo_img_shape[1] / text_img_shape[1]
        else:
            ratio_h = ratio_w = 1.0

        # Add OCR text bounding boxes (with coordinate scaling if needed)
        for text in ocr_data['texts']:
            col_min = int(text['column_min'] * ratio_w)
            row_min = int(text['row_min'] * ratio_h)
            col_max = int(text['column_max'] * ratio_w)
            row_max = int(text['row_max'] * ratio_h)
            ele = {
                'id': text.get('id', None),
                'class': 'Text',
                'content': text['content'],
                'column_min': col_min,
                'row_min': row_min,
                'column_max': col_max,
                'row_max': row_max,
                'width': col_max - col_min,
                'height': row_max - row_min
            }
            combined_eles.append(ele)

        # Reassign IDs and build hierarchical relationships
        combined_eles = build_hierarchy_and_reassign_ids(combined_eles)

        combined_output = {
            'img_shape': compo_img_shape,
            'compos': combined_eles
        }

        # Convert the elements to the format expected by the API
        parsed_content_list = []
        for ele in combined_eles:
            item = {
                'id': ele['id'],
                'type': ele['class'],
                'bbox': [ele['column_min'], ele['row_min'], ele['column_max'], ele['row_max']],
                'width': ele['width'],
                'height': ele['height']
            }

            if 'content' in ele:
                item['content'] = ele['content']
            elif 'text_content' in ele:
                item['content'] = ele['text_content']
            else:
                item['content'] = ''

            if 'parent' in ele:
                item['parent'] = ele['parent']

            if 'children' in ele:
                item['children'] = ele['children']

            # Determine interactivity based on element properties
            interactivity = determine_interactivity(ele, image)
            item['interactivity'] = interactivity

            item['source'] = 'combined'
            parsed_content_list.append(item)

        # Optionally save the combined data
        os.makedirs(pjoin(OUTPUT_ROOT, 'merge'), exist_ok=True)
        merged_json_path = pjoin(OUTPUT_ROOT, 'merge', f'combined_{int(time.time())}.json')
        with open(merged_json_path, 'w') as fp:
            json.dump(combined_output, fp, indent=4)

        # Optionally visualize if DRAW_BOUNDING_BOXES is True
        if DRAW_BOUNDING_BOXES or SAVE_MERGED_IMAGE:
            compo_h, compo_w, _ = compo_img_shape
            img_resized = cv2.resize(image, (compo_w, compo_h), interpolation=cv2.INTER_LINEAR)

            # Draw bounding boxes
            color_map = {
                'Compo': (0, 255, 0),
                'Text': (0, 0, 255)
            }
            for c in combined_eles:
                cat = c.get('class', 'Compo')
                color = color_map.get(cat, (255, 0, 0))
                x1, y1 = c['column_min'], c['row_min']
                x2, y2 = c['column_max'], c['row_max']
                cv2.rectangle(img_resized, (x1, y1), (x2, y2), color, 2)

            if SAVE_MERGED_IMAGE:
                merged_img_path = pjoin(OUTPUT_ROOT, 'merge', f'combined_{int(time.time())}.jpg')
                cv2.imwrite(merged_img_path, img_resized, [cv2.IMWRITE_JPEG_QUALITY, 95])

        return combined_output, parsed_content_list

    except Exception as e:
        print(f"Error in combining components and texts: {e}")
        traceback.print_exc()

        # Create a fallback result if something goes wrong
        if isinstance(image, np.ndarray):
            height, width = image.shape[:2]
        else:
            height, width = 1080, 1920  # Default values

        fallback_list = [
            {
                "id": 0,
                "type": "Compo",
                "bbox": [0, 0, width, height],
                "width": width,
                "height": height,
                "content": "",
                "interactivity": "clickable",
                "source": "fallback"
            }
        ]

        fallback_output = {
            "img_shape": [height, width, 3],
            "compos": [
                {
                    "id": 0,
                    "class": "Compo",
                    "column_min": 0,
                    "row_min": 0,
                    "column_max": width,
                    "row_max": height,
                    "width": width,
                    "height": height
                }
            ]
        }

        return fallback_output, fallback_list

def determine_interactivity(element, image):
    """
    Determines if an element is likely to be interactive based on its properties
    and appearance in the image.

    Args:
        element: Element dictionary with position information
        image: Original image (NumPy array)

    Returns:
        String indicating interactivity type
    """
    if element['class'] == 'Text':
        return 'static'

    # For UI components, try to analyze if they might be interactive
    try:
        if HAVE_OPENCV:
            # Extract the region of the image corresponding to this element
            x1, y1 = element['column_min'], element['row_min']
            x2, y2 = element['column_max'], element['row_max']

            # Make sure coordinates are within image bounds
            h, w = image.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 <= x1 or y2 <= y1:
                return 'unknown'

            region = image[y1:y2, x1:x2]
            if region.size == 0:
                return 'unknown'

            # Check for features that might indicate interactivity

            # Look for button-like appearance (rectangles with consistent color)
            gray_region = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
            _, binary = cv2.threshold(gray_region, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if contours:
                largest_contour = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest_contour)

                # If contour area is significant part of the region, might be a button
                if area > 0.5 * region.shape[0] * region.shape[1]:
                    return 'clickable'

            # Look for small square/circular elements (might be checkboxes, radio buttons)
            aspect_ratio = (x2 - x1) / (y2 - y1) if (y2 - y1) > 0 else 0
            if 0.8 < aspect_ratio < 1.2 and element['width'] < 50 and element['height'] < 50:
                return 'toggleable'

            # Check for slider-like shapes (wide rectangles)
            if element['width'] > 3 * element['height'] and element['height'] < 50:
                return 'slider'
    except Exception as e:
        print(f"Error determining interactivity: {e}")

    # Default for UI components when can't determine more specific type
    return 'clickable'

def process_image_in_memory(image_input):
    """
    Process the image using UI component detection and OCR

    Args:
        image_input: PIL Image object

    Returns:
        Tuple of (parsed_content_list, parsed_content_str)
    """
    try:
        print("Starting image processing")

        # Convert PIL Image to OpenCV format if needed
        if isinstance(image_input, Image.Image):
            if image_input.mode != "RGB":
                image_input = image_input.convert("RGB")
                print(f"Converted image to RGB mode, size: {image_input.size}")
            img_np = np.array(image_input)
            img_np = img_np[:, :, ::-1].copy()  # RGB to BGR for OpenCV
            print(f"Converted PIL image to NumPy array, shape: {img_np.shape}")
        else:
            img_np = image_input
            print(f"Using provided NumPy array image, shape: {img_np.shape}")

        # Run OCR on the image
        print("Running OCR on the image")
        ocr_data = process_ocr(img_np)
        print(f"OCR complete, found {len(ocr_data['texts'])} text elements")

        # Run component detection
        print("Running component detection")
        compo_json_path = run_component_detection(img_np)
        print(f"Component detection complete, JSON at: {compo_json_path}")

        # Combine component and OCR results
        print("Combining component and OCR results")
        _, parsed_content_list = combine_compos_and_texts(img_np, compo_json_path, ocr_data)
        print(f"Combined results, found {len(parsed_content_list)} total elements")

        # Generate parsed content string
        parsed_content_str = "\n".join(
            [f"type: {x.get('type', '')}, bbox: {x.get('bbox', '')}, interactivity: {x.get('interactivity', '')}, "
             f"content: {x.get('content', '')}, source: {x.get('source', '')}"
             for x in parsed_content_list]
        )

        print(f"Generated parsed content string ({len(parsed_content_str)} chars)")
        return parsed_content_list, parsed_content_str

    except Exception as e:
        print(f"Error in process_image_in_memory: {e}")
        traceback.print_exc()

        # Create a minimal fallback result to avoid 500 errors
        fallback_list = [
            {
                "id": 0,
                "type": "Compo",
                "bbox": [0, 0, 800, 600],
                "width": 800,
                "height": 600,
                "content": "",
                "interactivity": "unknown",
                "source": "fallback"
            },
            {
                "id": 1,
                "type": "Text",
                "bbox": [20, 20, 200, 40],
                "width": 180,
                "height": 20,
                "content": "Fallback content - server error occurred",
                "interactivity": "static",
                "source": "fallback"
            }
        ]

        fallback_str = "\n".join(
            [f"type: {x.get('type', '')}, bbox: {x.get('bbox', '')}, interactivity: {x.get('interactivity', '')}, "
             f"content: {x.get('content', '')}, source: {x.get('source', '')}"
             for x in fallback_list]
        )

        return fallback_list, fallback_str

# =============================
# Flask Application Setup
# =============================
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
    try:
        # Ensure output directories exist
        os.makedirs(OUTPUT_ROOT, exist_ok=True)

        # Get image from request
        image_input = None
        if 'image' in request.files:
            file = request.files['image']
            try:
                image_input = Image.open(file)
                print(f"Received image from form data: {image_input.format}, size: {image_input.size}")
            except Exception as e:
                print(f"Error opening image file: {str(e)}")
                return jsonify({"error": f"Error opening image file: {str(e)}"}), 400
        else:
            try:
                data = request.get_json(silent=True) or {}
                image_b64 = data.get("image")
                if not image_b64:
                    print("No image provided in JSON payload")
                    return jsonify({"error": "No image provided"}), 400

                print(f"Received base64 image, length: {len(image_b64)}")
                image_bytes = base64.b64decode(image_b64)
                print(f"Decoded base64 to {len(image_bytes)} bytes")

                image_input = Image.open(io.BytesIO(image_bytes))
                print(f"Opened image: {image_input.format}, size: {image_input.size}")
            except Exception as e:
                print(f"Error decoding image: {str(e)}")
                traceback.print_exc()
                return jsonify({"error": f"Error decoding image: {str(e)}"}), 400

        # Process the image
        start = time.time()
        try:
            parsed_content_list, parsed_content_str = process_image_in_memory(image_input)
            print(f"Successfully processed image, found {len(parsed_content_list)} elements")
        except Exception as e:
            print(f"Processing error: {str(e)}")
            traceback.print_exc()
            return jsonify({"error": f"Processing error: {str(e)}"}), 500

        elapsed = time.time() - start
        print(f"Image processed in {elapsed:.2f} seconds.")

        # Create an HTML table from parsed content
        df = pd.DataFrame(parsed_content_list)
        # Ensure ID column exists
        if 'id' not in df.columns:
            df["ID"] = range(len(df))
        df_html = df.to_html(index=False)

        response_data = {
            "parsed_content": parsed_content_str,
            "parsed_content_table": df_html
        }
        return jsonify(response_data)

    except Exception as e:
        print(f"Unexpected error in API endpoint: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500

# =============================
# Main Entry Point
# =============================
if __name__ == "__main__":
    # Ensure all output directories exist
    for dir_path in ['temp', 'ip', 'ocr', 'merge']:
        os.makedirs(pjoin(OUTPUT_ROOT, dir_path), exist_ok=True)

    app.run(host="0.0.0.0", port=5001)