from os.path import join as pjoin
import cv2
import os
import numpy as np


def resize_height_by_longest_edge(img_path, resize_length=800):
    org = cv2.imread(img_path)
    height, width = org.shape[:2]
    if height > width:
        return resize_length
    else:
        return int(resize_length * (height / width))


def color_tips():
    color_map = {'Text': (0, 0, 255), 'Compo': (0, 255, 0), 'Block': (0, 255, 255), 'Text Content': (255, 0, 255)}
    board = np.zeros((200, 200, 3), dtype=np.uint8)

    board[:50, :, :] = (0, 0, 255)
    board[50:100, :, :] = (0, 255, 0)
    board[100:150, :, :] = (255, 0, 255)
    board[150:200, :, :] = (0, 255, 255)
    cv2.putText(board, 'Text', (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, 'Non-text Compo', (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, "Compo's Text Content", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.putText(board, "Block", (10, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.imshow('colors', board)

import json
import cv2
import os



def build_hierarchy_and_reassign_ids(elements):
    """
    1) Reassign all element IDs (Compo & Text) to ensure uniqueness.
    2) Build hierarchy: any 'Text' that is inside a 'Compo' becomes a child of that 'Compo'.
       If multiple Compos contain the same Text, you can decide how to handle it:
       (a) assign it to the first compo found,
       (b) assign it to the smallest compo, etc.
    :param elements: list of dicts, each with keys:
        ['id', 'class', 'column_min', 'row_min', 'column_max', 'row_max', 'width', 'height']
    :return: updated list with (1) new unique 'id' for each element, (2) 'children' lists for Compos, (3) 'parent' for Text if contained
    """

    # --- (A) Prepare: store all elements, wipe out children/parent references ---
    # We will create fresh unique IDs.
    for ele in elements:
        ele.pop('parent', None)
        ele.pop('children', None)

    # --- (B) Assign new IDs in a single pass, storing old->new ID map ---
    old_id_to_new_id = {}
    for i, ele in enumerate(elements):
        old_id = ele.get('id', None)
        old_id_to_new_id[old_id] = i
        ele['id'] = i  # new ID is just the index

    # --- (C) Add 'children' arrays to compos ---
    for ele in elements:
        if ele['class'] == 'Compo':
            ele['children'] = []

    # --- (D) For each Text, check if it is contained by any Compo ---
    # Here we define "contained" as: text bounding box is entirely within compo bounding box
    # That is: text’s row_min >= compo’s row_min, etc.
    def is_contained(inner, outer):
        return (inner['column_min'] >= outer['column_min'] and
                inner['row_min']   >= outer['row_min']   and
                inner['column_max'] <= outer['column_max'] and
                inner['row_max']   <= outer['row_max'])

    for txt in elements:
        if txt['class'] != 'Text':
            continue

        # Option A: Assign text to the *first* Compo that contains it
        # Option B: Or find the 'smallest' compo, etc.
        for comp in elements:
            if comp['class'] == 'Compo':
                if is_contained(txt, comp):
                    # Make the text a child of this compo
                    comp['children'].append(txt['id'])
                    txt['parent'] = comp['id']
                    # if you only want one parent, break:
                    break

    # Done: now all IDs are re-assigned, and hierarchical relationships are established.
    return elements


def combine_and_visualize_compos_and_texts(
    input_img_path,
    compo_json_path, 
    text_json_path, 
    output_dir='data/output/merge2',
    merged_json_name='combined.json',
    merged_img_name='combined.jpg'
):
    """
    1) Combine UI component bounding boxes and OCR text bounding boxes,
       handling dimension mismatch if needed.
    2) Reassign IDs so they're unique, and build hierarchy:
       - Any 'Text' inside a 'Compo' becomes that Compo's child.
    3) Draw all bounding boxes on the image (resized to compo’s shape).
    4) Save the combined JSON and merged image in 'merge2' folder.
    5) Display the merged image in a window before quitting.
    """
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Load both JSONs
    with open(compo_json_path, 'r') as f1:
        compo_json = json.load(f1)
    with open(text_json_path, 'r') as f2:
        text_json = json.load(f2)

    compo_img_shape = compo_json['img_shape']  # e.g. [498, 799, 3]
    text_img_shape  = text_json['img_shape']   # e.g. [1794, 2880, 3]

    # 2. Prepare a list to hold all elements (compos + texts)
    combined_eles = []

    # 3. Copy over the component bounding boxes
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
        # If present, copy text_content, children, etc.
        if 'text_content' in compo:
            ele['text_content'] = compo['text_content']
        if 'children' in compo:  # We'll rebuild these anyway, but you can keep if desired
            ele['children'] = compo['children']
        if 'parent' in compo:
            ele['parent'] = compo['parent']

        combined_eles.append(ele)

    # 4. Handle dimension mismatch (compo vs. text)
    if compo_img_shape != text_img_shape:
        ratio_h = compo_img_shape[0] / text_img_shape[0]  # e.g. 498 / 1794
        ratio_w = compo_img_shape[1] / text_img_shape[1]  # e.g. 799 / 2880
    else:
        ratio_h = ratio_w = 1.0

    # 5. Copy (and scale) the OCR bounding boxes
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

    # --- CALL OUR HELPER FUNCTION ---
    combined_eles = build_hierarchy_and_reassign_ids(combined_eles)

    # Build the final combined dictionary
    combined_output = {
        'img_shape': compo_img_shape,
        'compos': combined_eles
    }

    # 6. Save the combined JSON (with hierarchy)
    merged_json_path = os.path.join(output_dir, merged_json_name)
    with open(merged_json_path, 'w') as fp:
        json.dump(combined_output, fp, indent=4)
    print(f"Combined JSON saved to: {merged_json_path}")

    # 7. Visualize bounding boxes on the image (resized to compo's shape)
    img = cv2.imread(input_img_path)
    if img is None:
        raise ValueError(f"Cannot read image from {input_img_path}.")

    compo_h, compo_w, _ = compo_img_shape
    img_resized = cv2.resize(img, (compo_w, compo_h), interpolation=cv2.INTER_LINEAR)

    # Draw bounding boxes 
    color_map = {
        'Compo': (0, 255, 0),   # green
        'Text':  (0, 0, 255)    # red
    }
    for c in combined_output['compos']:
        cat = c.get('class', 'Compo')
        color = color_map.get(cat, (255, 0, 0))  # default = blue
        x1, y1 = c['column_min'], c['row_min']
        x2, y2 = c['column_max'], c['row_max']
        cv2.rectangle(img_resized, (x1, y1), (x2, y2), color, 2)

    # Save the merged image
    merged_img_path = os.path.join(output_dir, merged_img_name)
    cv2.imwrite(merged_img_path, img_resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Merged image saved to: {merged_img_path}")

    # Show the merged image
    cv2.imshow('Merged Image', img_resized)
    cv2.waitKey(0)
    cv2.destroyAllWindows()




if __name__ == '__main__':

    '''
        ele:min-grad: gradient threshold to produce binary map         
        ele:ffl-block: fill-flood threshold
        ele:min-ele-area: minimum area for selected elements 
        ele:merge-contained-ele: if True, merge elements contained in others
        text:max-word-inline-gap: words with smaller distance than the gap are counted as a line
        text:max-line-gap: lines with smaller distance than the gap are counted as a paragraph

        Tips:
        1. Larger *min-grad* produces fine-grained binary-map while prone to over-segment element to small pieces
        2. Smaller *min-ele-area* leaves tiny elements while prone to produce noises
        3. If not *merge-contained-ele*, the elements inside others will be recognized, while prone to produce noises
        4. The *max-word-inline-gap* and *max-line-gap* should be dependent on the input image size and resolution

        mobile: {'min-grad':4, 'ffl-block':5, 'min-ele-area':50, 'max-word-inline-gap':6, 'max-line-gap':1}
        web   : {'min-grad':3, 'ffl-block':5, 'min-ele-area':25, 'max-word-inline-gap':4, 'max-line-gap':4}
    '''
    key_params = {'min-grad':10, 'ffl-block':5, 'min-ele-area':50,
                  'merge-contained-ele':True, 'merge-line-to-paragraph':False, 'remove-bar':True}

    # set input image path
    input_path_img = 'data/input/im3.png'
    output_root = 'data/output'

    resized_height = resize_height_by_longest_edge(input_path_img, resize_length=800)
    color_tips()

    is_ip = True
    is_clf = False
    is_ocr = True
    is_merge = True

    if is_ocr:
        import detect_text.text_detection as text
        os.makedirs(pjoin(output_root, 'ocr'), exist_ok=True)
        text.text_detection(input_path_img, output_root, show=True, method='google')

    if is_ip:
        import detect_compo.ip_region_proposal as ip
        os.makedirs(pjoin(output_root, 'ip'), exist_ok=True)
        # switch of the classification func
        classifier = None
        if is_clf:
            classifier = {}
            from cnn.CNN import CNN
            # classifier['Image'] = CNN('Image')
            classifier['Elements'] = CNN('Elements')
            # classifier['Noise'] = CNN('Noise')
        ip.compo_detection(input_path_img, output_root, key_params,
                           classifier=classifier, resize_by_height=resized_height, show=True)

    if is_merge:
        import detect_merge.merge as merge
        os.makedirs(pjoin(output_root, 'merge'), exist_ok=True)
        name = input_path_img.split('/')[-1][:-4]
        compo_path = pjoin(output_root, 'ip', str(name) + '.json')
        ocr_path = pjoin(output_root, 'ocr', str(name) + '.json')
        output_dir = 'data/output/merge2'

        combined_results = combine_and_visualize_compos_and_texts(
        input_img_path=input_path_img,
        compo_json_path=compo_path,
        text_json_path=ocr_path,
        output_dir=output_dir,
        merged_json_name=f'{name}.json',
        merged_img_name=f'{name}.jpg'
        )



        #merge.merge(input_path_img, compo_path, ocr_path, pjoin(output_root, 'merge'),
        #            is_remove_bar=key_params['remove-bar'], is_paragraph=key_params['merge-line-to-paragraph'], show=True)
