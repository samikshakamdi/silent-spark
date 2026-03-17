'''import mediapipe as mp
print(mp.__version__)
print(hasattr(mp, "solutions"))'''
import joblib

model = joblib.load("gesture_svm_model.pkl")

print(model.classes_)