#!/usr/bin/env python
# backend/action_executor/main.py

import os
import time
import json
import base64
import traceback
import threading
import pyautogui
import logging
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional, Union
from flask import Flask, request, jsonify
# git testing pull request - prady 
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(__file__), "executor.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("action-executor")

# Configure PyAutoGUI
pyautogui.PAUSE = 0.1  # Default delay between actions
pyautogui.FAILSAFE = True  # Move mouse to upper-left corner to abort

# Flask app initialization
app = Flask(__name__)

# Global variables
executing_action = False
execution_lock = threading.Lock()
last_screenshot = None
last_screenshot_time = 0
SCREENSHOT_CACHE_TIME = 1.0  # seconds

def get_screenshot() -> Tuple[bytes, str]:
    """Take a screenshot and return both the raw bytes and base64 encoded string"""
    global last_screenshot, last_screenshot_time
    
    current_time = time.time()
    if last_screenshot and current_time - last_screenshot_time < SCREENSHOT_CACHE_TIME:
        # Use cached screenshot if it's recent enough
        return last_screenshot, base64.b64encode(last_screenshot).decode('utf-8')
    
    # Take a new screenshot
    screenshot = pyautogui.screenshot()
    img_bytes = screenshot.tobytes()
    
    # Cache the screenshot
    last_screenshot = img_bytes
    last_screenshot_time = current_time
    
    # Return both raw bytes and base64 encoded string
    return img_bytes, base64.b64encode(img_bytes).decode('utf-8')

class ActionExecutor:
    @staticmethod
    def execute_mouse_click(x: int, y: int, button: str = 'left', clicks: int = 1, interval: float = 0.1) -> Dict[str, Any]:
        """Execute a mouse click at the specified coordinates"""
        logger.info(f"Executing mouse click at ({x}, {y}) with {button} button")
        
        try:
            # Move the mouse to the target position
            pyautogui.moveTo(x, y, duration=0.2)
            
            # Perform the click
            pyautogui.click(x=x, y=y, button=button, clicks=clicks, interval=interval)
            
            return {
                "success": True,
                "action": "click",
                "coordinates": [x, y],
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing mouse click: {e}")
            return {
                "success": False,
                "action": "click",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_keyboard_input(text: str, interval: float = 0.01) -> Dict[str, Any]:
        """Type text on the keyboard"""
        logger.info(f"Executing keyboard input: {text}")
        
        try:
            # Type the text
            pyautogui.write(text, interval=interval)
            
            return {
                "success": True,
                "action": "type",
                "text": text,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing keyboard input: {e}")
            return {
                "success": False,
                "action": "type",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_key_press(key: str) -> Dict[str, Any]:
        """Press a specific key"""
        logger.info(f"Executing key press: {key}")
        
        try:
            # Press the key
            pyautogui.press(key)
            
            return {
                "success": True,
                "action": "press",
                "key": key,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing key press: {e}")
            return {
                "success": False,
                "action": "press",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_key_combination(keys: List[str]) -> Dict[str, Any]:
        """Press a combination of keys"""
        logger.info(f"Executing key combination: {keys}")
        
        try:
            # Press the key combination
            pyautogui.hotkey(*keys)
            
            return {
                "success": True,
                "action": "hotkey",
                "keys": keys,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing key combination: {e}")
            return {
                "success": False,
                "action": "hotkey",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_drag_and_drop(start_x: int, start_y: int, end_x: int, end_y: int, duration: float = 0.5) -> Dict[str, Any]:
        """Perform a drag and drop operation"""
        logger.info(f"Executing drag from ({start_x}, {start_y}) to ({end_x}, {end_y})")
        
        try:
            # Move to start position
            pyautogui.moveTo(start_x, start_y, duration=0.2)
            
            # Perform drag
            pyautogui.dragTo(end_x, end_y, duration=duration, button='left')
            
            return {
                "success": True,
                "action": "drag",
                "start_coordinates": [start_x, start_y],
                "end_coordinates": [end_x, end_y],
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing drag and drop: {e}")
            return {
                "success": False,
                "action": "drag",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_scroll(direction: str, amount: int = 10) -> Dict[str, Any]:
        """Scroll in the specified direction"""
        logger.info(f"Executing scroll {direction} by {amount}")
        
        try:
            # Convert direction to actual scroll amount
            scroll_amount = amount if direction.lower() == "down" else -amount
            
            # Perform scroll
            pyautogui.scroll(scroll_amount)
            
            return {
                "success": True,
                "action": "scroll",
                "direction": direction,
                "amount": amount,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing scroll: {e}")
            return {
                "success": False,
                "action": "scroll",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def wait(seconds: float) -> Dict[str, Any]:
        """Wait for the specified number of seconds"""
        logger.info(f"Waiting for {seconds} seconds")
        
        try:
            time.sleep(seconds)
            
            return {
                "success": True,
                "action": "wait",
                "seconds": seconds,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error executing wait: {e}")
            return {
                "success": False,
                "action": "wait",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @staticmethod
    def execute_action_sequence(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute a sequence of actions"""
        logger.info(f"Executing action sequence with {len(actions)} actions")
        
        results = []
        for action in actions:
            action_type = action.get("type")
            params = action.get("params", {})
            
            try:
                result = None
                
                if action_type == "click":
                    result = ActionExecutor.execute_mouse_click(
                        params.get("x"), 
                        params.get("y"),
                        params.get("button", "left"),
                        params.get("clicks", 1)
                    )
                elif action_type == "type":
                    result = ActionExecutor.execute_keyboard_input(
                        params.get("text"),
                        params.get("interval", 0.01)
                    )
                elif action_type == "press":
                    result = ActionExecutor.execute_key_press(params.get("key"))
                elif action_type == "hotkey":
                    result = ActionExecutor.execute_key_combination(params.get("keys", []))
                elif action_type == "drag":
                    result = ActionExecutor.execute_drag_and_drop(
                        params.get("start_x"),
                        params.get("start_y"),
                        params.get("end_x"),
                        params.get("end_y"),
                        params.get("duration", 0.5)
                    )
                elif action_type == "scroll":
                    result = ActionExecutor.execute_scroll(
                        params.get("direction", "down"),
                        params.get("amount", 10)
                    )
                elif action_type == "wait":
                    result = ActionExecutor.wait(params.get("seconds", 1.0))
                else:
                    result = {
                        "success": False,
                        "action": action_type,
                        "error": f"Unknown action type: {action_type}",
                        "timestamp": datetime.now().isoformat()
                    }
                
                results.append(result)
                
                # If an action fails, stop the sequence
                if not result.get("success", False):
                    logger.error(f"Action sequence failed at action {len(results)}")
                    break
                    
            except Exception as e:
                logger.error(f"Error in action sequence: {e}")
                results.append({
                    "success": False,
                    "action": action_type,
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                })
                break
        
        return results

# Flask routes
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "action-executor",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/screenshot', methods=['GET'])
def get_current_screenshot():
    """Get the current screen state"""
    try:
        _, screenshot_base64 = get_screenshot()
        return jsonify({
            "success": True,
            "screenshot": screenshot_base64,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error capturing screenshot: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/api/execute', methods=['POST'])
def execute_action():
    """Execute an action"""
    global executing_action
    
    # Get request data
    data = request.json
    
    if not data:
        return jsonify({
            "success": False,
            "error": "No action data provided"
        }), 400
    
    # Check if we're already executing an action
    with execution_lock:
        if executing_action:
            return jsonify({
                "success": False,
                "error": "Another action is already in progress"
            }), 409
        
        executing_action = True
    
    try:
        action_type = data.get("type")
        params = data.get("params", {})
        
        result = None
        
        if action_type == "click":
            result = ActionExecutor.execute_mouse_click(
                params.get("x"), 
                params.get("y"),
                params.get("button", "left"),
                params.get("clicks", 1)
            )
        elif action_type == "type":
            result = ActionExecutor.execute_keyboard_input(
                params.get("text"),
                params.get("interval", 0.01)
            )
        elif action_type == "press":
            result = ActionExecutor.execute_key_press(params.get("key"))
        elif action_type == "hotkey":
            result = ActionExecutor.execute_key_combination(params.get("keys", []))
        elif action_type == "drag":
            result = ActionExecutor.execute_drag_and_drop(
                params.get("start_x"),
                params.get("start_y"),
                params.get("end_x"),
                params.get("end_y"),
                params.get("duration", 0.5)
            )
        elif action_type == "scroll":
            result = ActionExecutor.execute_scroll(
                params.get("direction", "down"),
                params.get("amount", 10)
            )
        elif action_type == "wait":
            result = ActionExecutor.wait(params.get("seconds", 1.0))
        elif action_type == "sequence":
            result = {
                "success": True,
                "action": "sequence",
                "results": ActionExecutor.execute_action_sequence(params.get("actions", [])),
                "timestamp": datetime.now().isoformat()
            }
        else:
            result = {
                "success": False,
                "action": action_type,
                "error": f"Unknown action type: {action_type}",
                "timestamp": datetime.now().isoformat()
            }
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error executing action: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "action": data.get("type", "unknown"),
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500
    finally:
        with execution_lock:
            executing_action = False

@app.route('/api/position', methods=['GET'])
def get_mouse_position():
    """Get the current mouse position"""
    try:
        x, y = pyautogui.position()
        return jsonify({
            "success": True,
            "position": {"x": x, "y": y},
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting mouse position: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    logger.info("Starting Action Executor service")
    app.run(host='0.0.0.0', port=5002)