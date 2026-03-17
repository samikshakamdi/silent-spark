import joblib
import pandas as pd
import numpy as np

try:
    model = joblib.load("gesture_svm_model.pkl")
    print(f"Model type: {type(model)}")
    
    if hasattr(model, 'n_features_in_'):
        print(f"Number of features expected: {model.n_features_in_}")
    
    if hasattr(model, 'feature_names_in_'):
        print(f"Feature names: {model.feature_names_in_}")
    
    # Try a dummy prediction with 126 features
    try:
        dummy_X = np.zeros((1, 126))
        model.predict(dummy_X)
        print("Prediction with 126 features: SUCCESS")
    except Exception as e:
        print(f"Prediction with 126 features: FAILED - {e}")

    # Try a dummy prediction with 63 features
    try:
        dummy_X = np.zeros((1, 63))
        model.predict(dummy_X)
        print("Prediction with 63 features: SUCCESS")
    except Exception as e:
        print(f"Prediction with 63 features: FAILED - {e}")

except Exception as e:
    print(f"Error loading model: {e}")
