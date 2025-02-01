import pyautogui
import math

def move_in_circle(radius, repetitions=3, duration=0.1):
    start_x, start_y = pyautogui.position()
    pyautogui.mouseDown()
    for _ in range(repetitions):
        for angle in range(0, 360, 10):  # Move in 10-degree steps
            x = start_x + radius * math.cos(math.radians(angle))
            y = start_y + radius * math.sin(math.radians(angle))
            pyautogui.moveTo(x, y, duration=duration)
    pyautogui.mouseUp()

# Example usage:
move_in_circle(radius=50)  # Moves in a circle with a radius of 50 pixels