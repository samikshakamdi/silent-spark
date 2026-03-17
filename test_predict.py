import requests
import numpy as np

url = "http://127.0.0.1:8000/predict"
# Send 126 landmarks
landmarks = [0.0] * 126

try:
    response = requests.post(url, json={"landmarks": landmarks})
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
