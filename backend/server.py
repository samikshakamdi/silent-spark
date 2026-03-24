import os
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, Security, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

# --- CONFIGURATION ---
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-keep-it-safe") # Use environment variable in production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

# --- AUTH SETUP ---
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security = HTTPBearer()

# --- MODEL LOADING ---
MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(os.path.dirname(__file__), "gesture_svm_model.pkl"))
try:
    model = joblib.load(MODEL_PATH)
    print(f"✅ Model loaded from {MODEL_PATH}")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    # Fallback to root path if not found in backend/
    MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "gesture_svm_model.pkl")
    model = joblib.load(MODEL_PATH)
    print(f"✅ Model loaded from fallback: {MODEL_PATH}")

# --- SCHEMAS ---
class User(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    phone: Optional[str] = None

class ResetRequest(BaseModel):
    username: str
    recovery_info: str

class ResetPassword(BaseModel):
    username: str
    recovery_info: str # Verification link or info
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class LandmarkRequest(BaseModel):
    landmarks: List[float]

class PredictionResponse(BaseModel):
    gesture: str
    confidence: float

class GestureRequest(BaseModel):
    gesture_name: str
    landmarks: List[List[float]]

# --- APP SETUP ---
app = FastAPI(title="ISL Recognition API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STATIC FILES ---
# Mount the frontend directory to serve HTML/CSS/JS
FRONTEND_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=FRONTEND_PATH), name="static")

# --- ENDPOINTS ---
# --- ENDPOINTS ---


# --- IN-MEMORY DATABASE (Substitute with real DB if needed) ---
# Default user for demonstration
FAKE_USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("password123"),
        "email": "admin@example.com",
        "phone": "1234567890"
    }
}

# --- AUTH UTILS ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(auth: HTTPAuthorizationCredentials = Security(security)):
    token = auth.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# --- ENDPOINTS ---
@app.post("/login", response_model=Token)
async def login(user: User):
    db_user = FAKE_USERS_DB.get(user.username)
    if not db_user or not pwd_context.verify(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/register")
async def register(user: User):
    if user.username in FAKE_USERS_DB:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    FAKE_USERS_DB[user.username] = {
        "username": user.username,
        "hashed_password": pwd_context.hash(user.password),
        "email": user.email,
        "phone": user.phone
    }
    return {"message": "User registered successfully"}

@app.post("/request-reset")
async def request_reset(request: ResetRequest):
    username = request.username
    recovery_info = request.recovery_info
    
    db_user = FAKE_USERS_DB.get(username)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if recovery_info != db_user.get("email") and recovery_info != db_user.get("phone"):
        raise HTTPException(status_code=401, detail="Invalid recovery information")
    
    # Generate a dummy token
    mock_token = f"reset_{username}_12345"
    return {
        "message": "Reset link generated",
        "mock_link": f"http://127.0.0.1:8000/login.html?reset_token={mock_token}"
    }

@app.post("/confirm-reset")
async def confirm_reset(request: ResetPassword):
    db_user = FAKE_USERS_DB.get(request.username)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # In a real app, we would verify the token here
    # For this demo, we'll assume the token is valid if it reaches this endpoint
    db_user["hashed_password"] = pwd_context.hash(request.new_password)
    return {"message": "Password updated successfully"}

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: LandmarkRequest, current_user: str = Depends(get_current_user)):
    try:
        # Expecting 63 or 126 features based on the model's history
        features = np.array(request.landmarks).reshape(1, -1)
        
        # Check if the feature count matches the model's expectations
        if hasattr(model, 'n_features_in_') and features.shape[1] != model.n_features_in_:
            # Pad or truncate if necessary (though the app should send the correct amount)
            if features.shape[1] < model.n_features_in_:
                features = np.pad(features, ((0, 0), (0, model.n_features_in_ - features.shape[1])), 'constant')
            else:
                features = features[:, :model.n_features_in_]

        prediction = model.predict(features)[0]
        
        # Some models provide probability
        confidence = 1.0
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(features)
            confidence = float(np.max(probs))
            
        return {
            "gesture": str(prediction).upper(),
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- TRAINING UTILS ---
def run_training():
    global model
    import pandas as pd
    from sklearn.model_selection import train_test_split
    from sklearn.svm import SVC
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline

    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hand_landmarks.csv")
    if not os.path.exists(csv_path):
        print(f"❌ CSV not found at {csv_path}")
        return False

    try:
        import traceback
        data = pd.read_csv(csv_path, low_memory=False)
        
        # Clean data
        data['label'] = data['label'].astype(str) # Force label to string
        
        # Drop rows with NaN if any
        if data.isnull().values.any():
            print(f"⚠️ Dropping rows with missing values...")
            data = data.dropna()

        X = data.drop("label", axis=1)
        y = data["label"]

        # Ensure all columns in X are numeric
        X = X.apply(pd.to_numeric, errors='coerce').fillna(0)

        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        # Pipeline: Scaling + SVM
        new_model = Pipeline([
            ("scaler", StandardScaler()),
            ("svm", SVC(
                kernel="rbf",
                C=10,
                gamma="scale",
                probability=True
            ))
        ])

        # Train
        new_model.fit(X_train, y_train)
        
        # Save model
        joblib.dump(new_model, MODEL_PATH)
        
        # Reload global model
        model = new_model
        print(f"✅ Model re-trained and saved to {MODEL_PATH}")
        return True
    except Exception as e:
        print(f"❌ Training error: {e}")
        import traceback
        traceback.print_exc()
        return False

# --- NEW ENDPOINTS ---
@app.post("/upload-gesture")
async def upload_gesture(request: GestureRequest, current_user: str = Depends(get_current_user)):
    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hand_landmarks.csv")
    
    try:
        import csv
        with open(csv_path, mode='a', newline='') as f:
            writer = csv.writer(f)
            for frame in request.landmarks:
                # We only want the first 63 features to match current architecture
                features = frame[:63]
                if len(features) < 63:
                    features = features + [0.0] * (63 - len(features))
                
                # Append row: landmarks..., label
                writer.writerow(features + [request.gesture_name])
        
        return {"message": f"Successfully uploaded {len(request.landmarks)} frames for gesture '{request.gesture_name}'"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train")
async def train_model(current_user: str = Depends(get_current_user)):
    success = run_training()
    if success:
        return {"message": "Model re-trained successfully"}
    else:
        raise HTTPException(status_code=500, detail="Model training failed")

@app.delete("/delete-gesture/{name}")
async def delete_gesture(name: str, current_user: str = Depends(get_current_user)):
    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "hand_landmarks.csv")
    
    try:
        import pandas as pd
        if not os.path.exists(csv_path):
            raise HTTPException(status_code=404, detail="CSV file not found")
            
        data = pd.read_csv(csv_path, low_memory=False)
        data['label'] = data['label'].astype(str).str.strip()
        
        # Check if gesture exists (case-insensitive and stripped)
        search_name = name.strip()
        available_labels = data['label'].unique()
        
        if search_name not in available_labels:
            print(f"❓ Gesture '{search_name}' not found. Available: {available_labels}")
            raise HTTPException(status_code=404, detail=f"Gesture '{search_name}' not found in dataset. available: {list(available_labels)}")
            
        # Filter out rows with the given label
        original_count = len(data)
        data = data[data['label'] != search_name]
        deleted_count = original_count - len(data)
        
        # Save updated CSV
        data.to_csv(csv_path, index=False)
        print(f"🗑️ Deleted {deleted_count} rows for gesture '{name}'")
        
        # Trigger re-training
        success = run_training()
        
        return {
            "message": f"Successfully deleted gesture '{name}' and re-trained model",
            "rows_removed": deleted_count,
            "training_success": success
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Deletion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status")
async def api_status():
    return {"status": "ok"}

# Serve frontend from root
# This must be the last mount/route to avoid shadowing others
app.mount("/", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
