import pandas as pd

df = pd.read_csv("hand_landmarks.csv")
print(df.shape)
print(df["label"].value_counts())