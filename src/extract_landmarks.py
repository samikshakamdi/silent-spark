import cv2
import mediapipe as mp
import os
import csv
import math

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.7
)

# Paths (use raw string for Windows)
dataset_path = r"D:\VSC\isl-sign-recognition\data\dataset_ISL"
output_file = "hand_landmarks.csv"

# Safety check
if not os.path.exists(dataset_path):
    print("❌ Dataset folder not found!")
    exit()

# Open CSV file
with open(output_file, "w", newline="") as f:
    writer = csv.writer(f)

    # CSV Header (21 landmarks × 3 + label)
    header = []
    for i in range(21):
        header.extend([f"x{i}", f"y{i}", f"z{i}"])
    header.append("label")
    writer.writerow(header)

    total_images = 0
    detected_hands = 0

    # Loop through gesture folders
    for label in os.listdir(dataset_path):
        label_path = os.path.join(dataset_path, label)

        if not os.path.isdir(label_path):
            continue

        print(f"\n📂 Processing label: {label}")

        # Loop through images
        for img_name in os.listdir(label_path):

            # Allow only image files
            if not img_name.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            img_path = os.path.join(label_path, img_name)
            total_images += 1

            image = cv2.imread(img_path)
            if image is None:
                continue

            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            result = hands.process(image_rgb)

            if result.multi_hand_landmarks:
                detected_hands += 1

                for hand in result.multi_hand_landmarks:

                    # 🔹 Wrist (landmark 0)
                    wrist = hand.landmark[0]

                    # 🔹 Middle finger MCP (landmark 9) → scale reference
                    middle_mcp = hand.landmark[9]

                    # Compute hand scale
                    scale = math.sqrt(
                        (middle_mcp.x - wrist.x) ** 2 +
                        (middle_mcp.y - wrist.y) ** 2 +
                        (middle_mcp.z - wrist.z) ** 2
                    )

                    # Avoid division by zero
                    if scale == 0:
                        continue

                    row = []

                    # 🔥 NORMALIZED landmarks (translation + scale invariant)
                    for lm in hand.landmark:
                        row.extend([
                            (lm.x - wrist.x) / scale,
                            (lm.y - wrist.y) / scale,
                            (lm.z - wrist.z) / scale
                        ])

                    row.append(label)
                    writer.writerow(row)

# Final summary
print("\n==============================")
print("✅ Landmark extraction finished")
print("📸 Total images processed:", total_images)
print("✋ Hands detected:", detected_hands)
print("📄 CSV saved as:", output_file)
print("==============================")
