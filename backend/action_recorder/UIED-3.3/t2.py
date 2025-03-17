from flask import Flask, request, jsonify
import cv2
import numpy as np
import json
import base64
import io
from PIL import Image

# Toggle for OCR Engine: True = EasyOCR (with GPU support), False = Tesseract (default)
USE_EASYOCR = True

# Conditional Imports
if USE_EASYOCR:
    import easyocr
else:
    import pytesseract
    from pytesseract import Output
    # If Tesseract is not in your PATH, uncomment and adjust the following:
    # pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

app = Flask(__name__)

# Initialize EasyOCR once at startup if we're using it
if USE_EASYOCR:
    easyocr_reader = easyocr.Reader(['en'])

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

def detect_ui_components(img):
    """
    Detect UI components in the image.
    This is a simplified placeholder - in a real implementation,
    you would integrate your UI component detection here.
    """
    # For the simplified version, let's use a basic contour detection approach
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    compos = []
    h, w = img.shape[:2]

    for i, cnt in enumerate(contours):
        x, y, w, h = cv2.boundingRect(cnt)
        # Filter out very small components
        if w > 20 and h > 20:
            compo = {
                'id': i,
                'class': 'Compo',
                'column_min': x,
                'row_min': y,
                'column_max': x + w,
                'row_max': y + h,
                'width': w,
                'height': h
            }
            compos.append(compo)

    return {
        'img_shape': list(img.shape),
        'compos': compos
    }

def perform_ocr(img):
    """
    Perform OCR on the image using either EasyOCR or Tesseract.
    """
    h, w = img.shape[:2]

    ocr_output = {
        "img_shape": [h, w, 3],
        "texts": []
    }

    if USE_EASYOCR:
        # Use EasyOCR for OCR processing
        # Convert OpenCV image to bytes for EasyOCR
        success, encoded_img = cv2.imencode('.png', img)
        img_bytes = encoded_img.tobytes()

        # Use the global reader instance
        results = easyocr_reader.readtext(img_bytes)

        for i, (bbox, text, conf) in enumerate(results):
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
    else:
        # Use pytesseract for OCR processing
        ocr_data = pytesseract.image_to_data(img, output_type=Output.DICT)
        n_boxes = len(ocr_data['text'])
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
                    "id": i,
                    "column_min": left,
                    "row_min": top,
                    "column_max": left + width_box,
                    "row_max": top + height_box,
                    "content": text
                })

    return ocr_output

def combine_compos_and_texts(compo_json, text_json):
    """
    Combines UI component bounding boxes and OCR text bounding boxes,
    builds a hierarchical structure.
    """
    compo_img_shape = compo_json['img_shape']
    text_img_shape = text_json['img_shape']

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
    for text in text_json['texts']:
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

    return combined_output

def json_to_csv(combined_data):
    """
    Convert the combined JSON data to CSV format.
    """
    # Create header row
    headers = ["id", "class", "column_min", "row_min", "column_max", "row_max", "width", "height"]

    # Add optional columns if they exist in any element
    optional_columns = set()
    for element in combined_data['compos']:
        for key in element:
            if key not in headers and key not in ["children", "parent"]:
                optional_columns.add(key)

    # Add the optional columns to headers
    full_headers = headers + sorted(list(optional_columns))

    # Create CSV rows
    rows = [",".join(full_headers)]

    for element in combined_data['compos']:
        row_values = []
        for header in full_headers:
            if header in element:
                # Special handling for content that might contain commas
                if header == "content" and isinstance(element[header], str):
                    row_values.append(f'"{element[header]}"')
                else:
                    row_values.append(str(element[header]))
            else:
                row_values.append("")
        rows.append(",".join(row_values))

    return "\n".join(rows)

@app.route('/api/processImage', methods=['POST'])
def process_image():
    try:
        # Get the JSON data from the request
        data = request.get_json()

        # Make sure the image data is provided
        if 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400

        # Decode base64 image data
        image_data = base64.b64decode(data['image'])

        # Convert to numpy array and then to OpenCV image
        image = np.array(Image.open(io.BytesIO(image_data)))

        # If image is RGB (PIL default), convert to BGR (OpenCV format)
        if len(image.shape) == 3 and image.shape[2] == 3:
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

        # Process the image
        compo_json = detect_ui_components(image)
        text_json = perform_ocr(image)
        combined_json = combine_compos_and_texts(compo_json, text_json)

        # Convert to CSV format
        csv_content = json_to_csv(combined_json)

        # Return the processed data
        response = {
            'parsed_content': csv_content,
            'json_data': combined_json
        }

        return jsonify(response)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)