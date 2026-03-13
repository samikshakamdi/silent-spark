import cv2
import mediapipe as mp
import numpy as np
import joblib
import win32com.client as wincl

# ---------- SPEECH ----------
speaker = wincl.Dispatch("SAPI.SpVoice")

# ---------- MODEL ----------
model = joblib.load("gesture_svm_model.pkl")

# ---------- MEDIAPIPE ----------
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,   # detect up to 2 hands
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
mp_draw = mp.solutions.drawing_utils

# ---------- CAMERA ----------
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

cv2.namedWindow("ISL Real-Time Recognition", cv2.WINDOW_NORMAL)
cv2.resizeWindow("ISL Real-Time Recognition", 1280, 720)

# ---------- SPEECH CONTROL ----------
last_spoken = ""
stable_frames = 0
STABLE_FRAMES = 12

print("🎥 ISL recognition (stable + clean) started")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)

    display_text = "No hand"
    prediction = ""

    if result.multi_hand_landmarks:

        # 🔹 Draw ALL detected hands
        for hand_landmarks in result.multi_hand_landmarks:
            mp_draw.draw_landmarks(
                frame, hand_landmarks, mp_hands.HAND_CONNECTIONS
            )

        # 🔹 Use ONLY FIRST hand for ML (same as your old working version)
        hand_landmarks = result.multi_hand_landmarks[0]

        wrist = hand_landmarks.landmark[0]
        middle_mcp = hand_landmarks.landmark[9]

        scale = ((middle_mcp.x - wrist.x) ** 2 +
                 (middle_mcp.y - wrist.y) ** 2 +
                 (middle_mcp.z - wrist.z) ** 2) ** 0.5

        if scale > 0:
            features = []
            for lm in hand_landmarks.landmark:
                features.extend([
                    (lm.x - wrist.x) / scale,
                    (lm.y - wrist.y) / scale,
                    (lm.z - wrist.z) / scale
                ])

            X = np.array(features).reshape(1, -1)
            prediction = model.predict(X)[0]
            display_text = prediction.upper()

    # ---------- STABILITY + SPEECH ----------
    if prediction != "" and prediction == last_spoken:
        stable_frames = 0
    elif prediction != "":
        stable_frames += 1
    else:
        stable_frames = 0

    if stable_frames == STABLE_FRAMES and prediction != last_spoken:
        speaker.Speak(prediction)
        last_spoken = prediction
        stable_frames = 0

    # ---------- DISPLAY ----------
    cv2.putText(
        frame,
        display_text,
        (30, 90),
        cv2.FONT_HERSHEY_SIMPLEX,
        3.0,
        (0, 255, 0),
        6
    )

    cv2.imshow("ISL Real-Time Recognition", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
