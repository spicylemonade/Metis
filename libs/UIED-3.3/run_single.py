from os.path import join as pjoin
import cv2
import os
import numpy as np
import json
import matplotlib.pyplot as plt

# =============================
# Toggle Variables
# =============================

# OCR Engine Toggle: True = EasyOCR (with GPU support), False = Tesseract (default)
USE_EASYOCR = True

# Toggle for any image display windows (e.g., cv2.imshow or plt.show)
SHOW_IMAGE_WINDOWS = False

# Toggle for drawing bounding boxes on images (and merging visualization)
DRAW_BOUNDING_BOXES = False

# Toggle for saving the merged image to disk
SAVE_MERGED_IMAGE = False

# =============================
# Conditional Imports
# =============================
if USE_EASYOCR:
    import easyocr
else:
    import pytesseract
    from pytesseract import Output
    # If Tesseract is not in your PATH, uncomment and adjust the following:
    # pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# =============================
# Helper Functions
# =============================
def resize_height_by_longest_edge(img_path, resize_length=800):
    org = cv2.imread(img_path)
    height, width = org.shape[:2]
    if height > width:
        return resize_length
    else:
        return int(resize_length * (height / width))

def color_tips():
    # This function shows a simple color legend.
    color_map = {'Text': (0, 0, 255), 'Compo': (0, 255, 0),
                 'Block': (0, 255, 255), 'Text Content': (255, 0, 255)}
    board = np.zeros((200, 200, 3), dtype=np.uint8)
    board[:50, :, :] = (0, 0, 255)
    board[50:100, :, :] = (0, 255, 0)
    board[100:150, :, :] = (255, 0, 255)
    board[150:200, :, :] = (0, 255, 255)
    cv2.putText(board, 'Text', (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, 'Non-text Compo', (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, "Compo's Text Content", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, "Block", (10, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    if SHOW_IMAGE_WINDOWS:
        cv2.imshow('colors', board)
        cv2.waitKey(500)  # show for a brief moment
        cv2.destroyWindow('colors')
    # Else, do nothing

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
                inner['row_min']   >= outer['row_min']   and
                inner['column_max'] <= outer['column_max'] and
                inner['row_max']   <= outer['row_max'])
    
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

def combine_and_visualize_compos_and_texts(
    input_img_path,
    compo_json_path, 
    text_json_path, 
    output_dir='data/output/merge2',
    merged_json_name='combined.json',
    merged_img_name='combined.jpg',
    draw_boxes=DRAW_BOUNDING_BOXES,
    save_image=SAVE_MERGED_IMAGE,
    show_image=SHOW_IMAGE_WINDOWS
):
    """
    Combines UI component bounding boxes and OCR text bounding boxes,
    builds a hierarchical structure, optionally draws bounding boxes on the image,
    and optionally saves/displays the merged image.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Load JSONs for UI components and OCR texts.
    with open(compo_json_path, 'r') as f1:
        compo_json = json.load(f1)
    with open(text_json_path, 'r') as f2:
        text_json = json.load(f2)

    compo_img_shape = compo_json['img_shape']  # e.g., [height, width, 3]
    text_img_shape  = text_json['img_shape']   # e.g., [height, width, 3]

    combined_eles = []

    # Copy UI component bounding boxes from compo_json.
    for compo in compo_json['compos']:
        ele = {
            'id': compo.get('id', None),
            'class': compo.get('class', 'Compo'),
            'column_min': compo['column_min'],
            'row_min':    compo['row_min'],
            'column_max': compo['column_max'],
            'row_max':    compo['row_max'],
            'width':      compo['width'],
            'height':     compo['height']
        }
        if 'text_content' in compo:
            ele['text_content'] = compo['text_content']
        if 'children' in compo:
            ele['children'] = compo['children']
        if 'parent' in compo:
            ele['parent'] = compo['parent']
        combined_eles.append(ele)

    # Compute scaling ratios if the image sizes differ.
    if compo_img_shape != text_img_shape:
        ratio_h = compo_img_shape[0] / text_img_shape[0]
        ratio_w = compo_img_shape[1] / text_img_shape[1]
    else:
        ratio_h = ratio_w = 1.0

    # Add OCR text bounding boxes (with coordinate scaling if needed).
    for text in text_json['texts']:
        col_min = int(text['column_min'] * ratio_w)
        row_min = int(text['row_min'] * ratio_h)
        col_max = int(text['column_max'] * ratio_w)
        row_max = int(text['row_max'] * ratio_h)
        ele = {
            'id':       text.get('id', None),
            'class':    'Text',
            'content':  text['content'],
            'column_min': col_min,
            'row_min':    row_min,
            'column_max': col_max,
            'row_max':    row_max,
            'width':      col_max - col_min,
            'height':     row_max - row_min
        }
        combined_eles.append(ele)

    # Reassign IDs and build hierarchical relationships.
    combined_eles = build_hierarchy_and_reassign_ids(combined_eles)

    combined_output = {
        'img_shape': compo_img_shape,
        'compos': combined_eles
    }

    # Save the combined JSON file.
    merged_json_path = os.path.join(output_dir, merged_json_name)
    with open(merged_json_path, 'w') as fp:
        json.dump(combined_output, fp, indent=4)
    print(f"Combined JSON saved to: {merged_json_path}")

    # Optionally, draw bounding boxes on the image.
    img = cv2.imread(input_img_path)
    if img is None:
        raise ValueError(f"Cannot read image from {input_img_path}.")
    compo_h, compo_w, _ = compo_img_shape
    img_resized = cv2.resize(img, (compo_w, compo_h), interpolation=cv2.INTER_LINEAR)

    if draw_boxes:
        # Color coding: UI components in green, OCR texts in red.
        color_map = {
            'Compo': (0, 255, 0),
            'Text':  (0, 0, 255)
        }
        for c in combined_output['compos']:
            cat = c.get('class', 'Compo')
            color = color_map.get(cat, (255, 0, 0))
            x1, y1 = c['column_min'], c['row_min']
            x2, y2 = c['column_max'], c['row_max']
            cv2.rectangle(img_resized, (x1, y1), (x2, y2), color, 2)

    if save_image:
        merged_img_path = os.path.join(output_dir, merged_img_name)
        cv2.imwrite(merged_img_path, img_resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f"Merged image saved to: {merged_img_path}")

    if show_image:
        cv2.imshow('Merged Image', img_resized)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

# =============================
# Main Script
# =============================
if __name__ == '__main__':
    # Parameter notes (adjust as needed)
    key_params = {'min-grad':10, 'ffl-block':5, 'min-ele-area':50,
                  'merge-contained-ele':True, 'merge-line-to-paragraph':False, 'remove-bar':True}

    # Input image path (update if needed)
    input_path_img = 'data/input/image.png'
    output_root = 'data/output'

    resized_height = resize_height_by_longest_edge(input_path_img, resize_length=800)
    # Optionally, call color_tips() to see a color legend (if SHOW_IMAGE_WINDOWS is True)
    # color_tips()

    # Control flags for the processing pipeline.
    is_ip = True    # UI component detection
    is_clf = False  # Classification branch (if applicable)
    is_ocr = True   # OCR using EasyOCR or Tesseract (based on toggle)
    is_merge = True # Merging of UI components and OCR texts

    # ----------- OCR Branch -----------
    if is_ocr:
        os.makedirs(pjoin(output_root, 'ocr'), exist_ok=True)
        
        # Read the input image using OpenCV.
        img = cv2.imread(input_path_img)
        if img is None:
            raise ValueError(f"Cannot read image from {input_path_img}.")
        h, w = img.shape[:2]
        
        ocr_output = {
            "img_shape": [h, w, 3],
            "texts": []
        }
        
        if USE_EASYOCR:
            # Use EasyOCR for OCR processing.
            reader = easyocr.Reader(['en'])
            results = reader.readtext(input_path_img)
            
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
            # Use pytesseract for OCR processing.
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
        
        # Save the OCR JSON.
        name = os.path.basename(input_path_img).split('.')[0]
        ocr_json_path = pjoin(output_root, 'ocr', f'{name}.json')
        with open(ocr_json_path, 'w') as f:
            json.dump(ocr_output, f, indent=4)
        print(f"OCR JSON saved to: {ocr_json_path}")

        # Optional: if you wish to visualize OCR results using matplotlib,
        # make sure SHOW_IMAGE_WINDOWS is True. (This block is commented for headless mode.)
        """
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        for text_data in ocr_output["texts"]:
            cv2.rectangle(img_rgb, 
                          (text_data["column_min"], text_data["row_min"]),
                          (text_data["column_max"], text_data["row_max"]),
                          (0, 255, 0), 2)
            cv2.putText(img_rgb, text_data["content"], 
                        (text_data["column_min"], text_data["row_min"]-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)
        plt.figure(figsize=(10,10))
        plt.imshow(img_rgb)
        plt.axis("off")
        plt.show()
        """

    # ----------- UI Component Detection -----------
    if is_ip:
        # Ensure the module 'detect_compo.ip_region_proposal' is available.
        import detect_compo.ip_region_proposal as ip
        os.makedirs(pjoin(output_root, 'ip'), exist_ok=True)
        classifier = None
        if is_clf:
            classifier = {}
            from cnn.CNN import CNN
            classifier['Elements'] = CNN('Elements')
        print("Running UI Component Detection...")
        ip.compo_detection(input_path_img, output_root, key_params,
                           classifier=classifier, resize_by_height=resized_height, show=False)

    # ----------- Merging Results -----------
    if is_merge:
        import detect_merge.merge as merge
        os.makedirs(pjoin(output_root, 'merge'), exist_ok=True)
        name = os.path.basename(input_path_img).split('.')[0]
        compo_path = pjoin(output_root, 'ip', f'{name}.json')
        ocr_path = pjoin(output_root, 'ocr', f'{name}.json')
        output_dir = pjoin(output_root, 'merge2')
        
        combine_and_visualize_compos_and_texts(
            input_img_path=input_path_img,
            compo_json_path=compo_path,
            text_json_path=ocr_path,
            output_dir=output_dir,
            merged_json_name=f'{name}.json',
            merged_img_name=f'{name}.jpg',
            draw_boxes=DRAW_BOUNDING_BOXES,
            save_image=SAVE_MERGED_IMAGE,
            show_image=SHOW_IMAGE_WINDOWS
        )
