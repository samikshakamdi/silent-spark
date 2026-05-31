# 🤟 Silent Spark

**Silent Spark** is a real-time hand gesture recognition web application that bridges communication for the hearing-impaired community. It uses computer vision and machine learning to detect and interpret sign language gestures through a webcam, translating them into text in real time.

---

## 🌟 Features

- **Real-time gesture recognition** using a webcam feed
- **SVM-based ML model** trained on hand landmark data for accurate sign classification
- **Hand landmark detection** powered by MediaPipe
- **FastAPI backend** for fast, async model inference
- **Secure API** with JWT-based authentication (python-jose + passlib)
- **Responsive frontend** built with HTML, CSS, and JavaScript

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Computer Vision | OpenCV, MediaPipe |
| ML Model | Scikit-learn (SVM), Joblib |
| Backend | FastAPI, Uvicorn |
| Auth | python-jose (JWT), passlib (bcrypt) |
| Frontend | HTML, CSS, JavaScript |
| Data | NumPy, Pandas |

---

## 📁 Project Structure

```
silent-spark/
├── backend/               # FastAPI server and API routes
├── frontend/              # Web UI (HTML/CSS/JS)
├── src/                   # Core ML and processing scripts
├── gesture_svm_model.pkl  # Trained SVM model
├── hand_landmarks.csv     # Landmark dataset used for training
├── inspect_model.py       # Model inspection utility
├── test_predict.py        # Prediction testing script
├── requirements.txt       # Python dependencies
└── Procfile               # Deployment configuration
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- A webcam
- Node.js (for frontend development, optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/samikshakamdi/silent-spark.git
   cd silent-spark
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the backend server**
   ```bash
   uvicorn backend.main:app --reload
   ```

4. **Open the frontend**  
   Open `frontend/index.html` in your browser, or serve it with a local HTTP server.

---

## 🧠 How It Works

1. The webcam feed is captured and processed frame-by-frame using **OpenCV**.
2. **MediaPipe** extracts 21 hand landmarks (x, y, z coordinates) from each frame.
3. These landmarks are passed to the trained **SVM model** (`gesture_svm_model.pkl`) which classifies the gesture.
4. The predicted gesture label is returned via the **FastAPI** backend and displayed on the frontend.

---

## 📦 Dependencies

```
opencv-python
mediapipe==0.10.9
numpy
pandas
scikit-learn
joblib
fastapi
uvicorn[standard]
python-jose[cryptography]
passlib[bcrypt]
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change, then submit a pull request.

---

## 📄 License

This project is open source. Feel free to use it and build upon it.

---

> *"Giving voice to silence — one gesture at a time."*
