import cv2
import os
import requests
import json
from base64 import b64encode
import time


def Google_OCR_makeImageData(imgpath):
    with open(imgpath, 'rb') as f:
        ctxt = b64encode(f.read()).decode()
        img_req = {
            'image': {
                'content': ctxt
            },
            'features': [{
                'type': 'DOCUMENT_TEXT_DETECTION',
                # 'type': 'TEXT_DETECTION',
                'maxResults': 1
            }]
        }
    return json.dumps({"requests": img_req}).encode()


def ocr_detection_google(imgpath):
    start = time.perf_counter()  # Updated to use perf_counter
    url = 'https://vision.googleapis.com/v1/images:annotate'
    api_key = 'AIzaSyDKe6jx2VRL7htwg2bASQeD-QtRN_TcOyk'  # *** Replace with your own Key ***
    imgdata = Google_OCR_makeImageData(imgpath)
    response = requests.post(
        url,
        data=imgdata,
        params={'key': api_key},
        headers={'Content_Type': 'application/json'}
    )
    
    print("*** Please replace the Google OCR key at detect_text/ocr.py line 28 with your own (apply in https://cloud.google.com/vision) ***")
    
    # Uncomment the line below if you want to print the elapsed time
    # print('*** Text Detection Time Taken:%.3fs ***' % (time.perf_counter() - start))
    
    if response.json().get('responses') == [{}]:
        # No Text
        return None
    else:
        return response.json()['responses'][0].get('textAnnotations', [])[1:]
