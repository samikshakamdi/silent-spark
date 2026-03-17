// Global error listener for debugging
window.addEventListener('error', function (event) {
    console.error('🔥 Global Error:', event.error);
    const predText = document.getElementById('prediction-text');
    if (predText) predText.textContent = 'Script Error: Check Console';
});

// Prevent multiple initializations
if (window.islAppInitialized) {
    console.warn("⚠️ ISL App already initialized.");
} else {
    window.islAppInitialized = true;

    const videoElement = document.getElementsByClassName('input_video')[0];
    const canvasElement = document.getElementsByClassName('output_canvas')[0];
    const canvasCtx = canvasElement.getContext('2d');
    const predictionText = document.getElementById('prediction-text');
    const startBtn = document.getElementById('start-btn');
    const recordBtn = document.getElementById('record-gesture-btn');
    const muteBtn = document.getElementById('mute-btn');
    const muteIcon = document.getElementById('mute-icon');
    const recordingOverlay = document.getElementById('recording-overlay');
    const recordingTimer = document.getElementById('recording-timer');
    const recordingMsg = document.getElementById('recording-msg');
    const recordingProgress = document.getElementById('recording-progress');

    let isPredicting = false;
    let lastPredictionTime = 0;
    const PREDICTION_INTERVAL = 200;
    let streamActive = false;

    // Recording State
    let isRecording = false;
    let recordedFrames = [];
    let recordingDuration = 3000; // 3 seconds
    let recordingStartTime = 0;

    // Custom Gesture Prediction Cache
    let loadedCustomGestures = [];

    // IndexedDB Setup
    const DB_NAME = "ISLGesturesDB";
    const STORE_NAME = "customGestures";
    let db;

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        console.log("📦 IndexedDB Ready.");
        refreshCustomGestures();
    };
    request.onerror = (e) => console.error("❌ IndexedDB Error:", e);

    async function refreshCustomGestures() {
        if (!db) return;
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            loadedCustomGestures = request.result;
            console.log(`📡 Cached ${loadedCustomGestures.length} custom gestures.`);
        };
    }

    console.log("🚀 Starting ISL App Logic...");

    function onResults(results) {
        if (!results.image || !streamActive) return;

        if (canvasElement.width !== videoElement.videoWidth && videoElement.videoWidth > 0) {
            console.log(`📏 Setting canvas size: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        }

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const now = Date.now();
            results.multiHandLandmarks.forEach((landmarks) => {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 4 });
                drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2, radius: 4 });
            });

            if (isRecording) {
                recordFrame(results.multiHandLandmarks);
            } else if (!isPredicting && now - lastPredictionTime > PREDICTION_INTERVAL) {
                sendForPrediction(results.multiHandLandmarks);
                lastPredictionTime = now;
            }
        } else {
            predictionText.textContent = "Waiting for hands...";
        }
        canvasCtx.restore();
    }

    let lastSpokenGesture = "";
    let gestureStabilityCount = 0;
    const STABILITY_THRESHOLD = 3; // Number of consistent frames before speaking
    let isMuted = false;

    function speak(text) {
        if (isMuted || !text) return;
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }

    function recordFrame(multiHandLandmarks) {
        const allFeatures = [];
        const handsToProcess = Math.min(2, multiHandLandmarks.length);

        for (let h = 0; h < 2; h++) {
            if (h < handsToProcess) {
                const landmarks = multiHandLandmarks[h];
                const wrist = landmarks[0];
                const middleMcp = landmarks[9];
                const scale = Math.sqrt(
                    Math.pow(middleMcp.x - wrist.x, 2) +
                    Math.pow(middleMcp.y - wrist.y, 2) +
                    Math.pow(middleMcp.z - wrist.z, 2)
                );

                if (scale === 0) {
                    for (let i = 0; i < 63; i++) allFeatures.push(0.0);
                } else {
                    for (let i = 0; i < 21; i++) {
                        allFeatures.push((landmarks[i].x - wrist.x) / scale);
                        allFeatures.push((landmarks[i].y - wrist.y) / scale);
                        allFeatures.push((landmarks[i].z - wrist.z) / scale);
                    }
                }
            } else {
                for (let i = 0; i < 63; i++) allFeatures.push(0.0);
            }
        }
        recordedFrames.push(allFeatures);

        // Update progress bar
        const elapsed = Date.now() - recordingStartTime;
        const progress = Math.min(100, (elapsed / recordingDuration) * 100);
        recordingProgress.style.width = `${progress}%`;

        if (elapsed >= recordingDuration) {
            stopRecording();
        }
    }

    function startRecordingWithCountdown() {
        const gestureName = prompt("Enter a name for this gesture:", "CustomGesture");
        if (!gestureName) return;

        recordingOverlay.style.display = 'flex';
        recordingMsg.textContent = "Prepare to record...";
        recordingTimer.textContent = "3";
        recordingProgress.style.width = "0%";
        recordingOverlay.classList.remove('recording-active');

        let countdown = 3;
        const interval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                recordingTimer.textContent = countdown;
            } else {
                clearInterval(interval);
                startCapture(gestureName);
            }
        }, 1000);
    }

    function startCapture(name) {
        isRecording = true;
        recordedFrames = [];
        recordingStartTime = Date.now();
        recordingTimer.textContent = "REC";
        recordingMsg.textContent = `Recording "${name}"...`;
        recordingOverlay.classList.add('recording-active');
    }

    function stopRecording() {
        isRecording = false;
        recordingOverlay.style.display = 'none';
        saveGesture(recordingMsg.textContent.match(/"([^"]+)"/)[1]);
    }

    async function saveGesture(name) {
        if (!db) return alert("Database not ready!");
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const gesture = {
            name: name,
            timestamp: Date.now(),
            frameCount: recordedFrames.length,
            data: recordedFrames
        };
        store.add(gesture);
        transaction.oncomplete = () => {
            alert(`✅ Gesture "${name}" saved! (${recordedFrames.length} frames captured)\n\nStored landmarks can be accessed via IndexedDB for training.`);
            console.log("💾 Gesture saved to IndexedDB.");
            refreshCustomGestures(); // Refresh cache to include new gesture
        };
    }

    function findCustomMatch(currentFeatures) {
        if (loadedCustomGestures.length === 0) return null;

        let bestMatch = null;
        let minDistance = 0.15; // Threshold for matching

        for (const gesture of loadedCustomGestures) {
            for (const frame of gesture.data) {
                let distance = 0;
                for (let i = 0; i < currentFeatures.length; i++) {
                    distance += Math.pow(currentFeatures[i] - frame[i], 2);
                }
                distance = Math.sqrt(distance);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = gesture.name;
                }
            }
        }
        return bestMatch;
    }

    async function sendForPrediction(multiHandLandmarks) {
        isPredicting = true;
        const allFeatures = [];
        const handsToProcess = Math.min(2, multiHandLandmarks.length);

        for (let h = 0; h < 2; h++) {
            if (h < handsToProcess) {
                const landmarks = multiHandLandmarks[h];
                const wrist = landmarks[0];
                const middleMcp = landmarks[9];
                const scale = Math.sqrt(
                    Math.pow(middleMcp.x - wrist.x, 2) +
                    Math.pow(middleMcp.y - wrist.y, 2) +
                    Math.pow(middleMcp.z - wrist.z, 2)
                );

                if (scale === 0) {
                    for (let i = 0; i < 63; i++) allFeatures.push(0.0);
                } else {
                    for (let i = 0; i < 21; i++) {
                        allFeatures.push((landmarks[i].x - wrist.x) / scale);
                        allFeatures.push((landmarks[i].y - wrist.y) / scale);
                        allFeatures.push((landmarks[i].z - wrist.z) / scale);
                    }
                }
            } else {
                for (let i = 0; i < 63; i++) allFeatures.push(0.0);
            }
        }

        // 1. Check Custom Gestures First
        const customMatch = findCustomMatch(allFeatures);
        if (customMatch) {
            const currentGesture = customMatch.toString().toUpperCase();
            predictionText.textContent = `Custom: ${currentGesture}`;

            if (currentGesture !== lastSpokenGesture) {
                speak(currentGesture);
                lastSpokenGesture = currentGesture;
            }
            isPredicting = false;
            return;
        }

        // 2. Fallback to Backend API
        try {
            const response = await fetch("http://127.0.0.1:8000/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ landmarks: allFeatures })
            });
            const data = await response.json();
            if (data.gesture) {
                const currentGesture = data.gesture.toString().toUpperCase();
                predictionText.textContent = `Gesture: ${currentGesture} (${Math.round(data.confidence * 100)}%)`;

                // Speech Logic
                if (currentGesture === lastSpokenGesture) {
                    gestureStabilityCount = 0; // Reset if already spoken
                } else {
                    if (data.confidence > 0.4) {
                        gestureStabilityCount++;
                        if (gestureStabilityCount >= STABILITY_THRESHOLD) {
                            speak(currentGesture);
                            lastSpokenGesture = currentGesture;
                            gestureStabilityCount = 0;
                        }
                    } else {
                        gestureStabilityCount = 0;
                    }
                }
            }
        } catch (error) {
            console.error("API Error:", error);
            predictionText.textContent = "API Error";
        } finally {
            isPredicting = false;
        }
    }

    console.log("✋ Initializing MediaPipe Hands...");
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    async function processFrame() {
        if (streamActive && videoElement.readyState >= 2) {
            try {
                await hands.send({ image: videoElement });
            } catch (e) {
                // Fail silently for single frames
            }
        }
        requestAnimationFrame(processFrame);
    }

    const startApp = async () => {
        console.log("🎬 startApp initiated...");
        startBtn.disabled = true;
        startBtn.textContent = "Initializing...";
        predictionText.textContent = "Requesting Camera...";

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });

            videoElement.srcObject = stream;
            console.log("✅ Camera stream acquired.");

            videoElement.onloadedmetadata = () => {
                videoElement.play();
                streamActive = true;
                startBtn.style.display = 'none';
                muteBtn.style.display = 'block';
                recordBtn.style.display = 'block';
                console.log("▶️ Video playing, starting recognition loop.");
                processFrame();
            };
        } catch (err) {
            console.error("❌ Camera error:", err);
            predictionText.textContent = "Error: " + err.message;
            startBtn.disabled = false;
            startBtn.textContent = "Retry Start";
            alert("Camera error: " + err.message + "\nPlease ensure camera is connected and permissions granted.");
        }
    };

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        muteIcon.textContent = isMuted ? "🔇" : "🔊";
        muteBtn.innerHTML = `<span id="mute-icon">${isMuted ? "🔇" : "🔊"}</span> ${isMuted ? "Muted" : "Unmuted"}`;
        muteBtn.style.background = isMuted ? "rgba(255, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.15)";
    });

    recordBtn.addEventListener('click', startRecordingWithCountdown);

    startBtn.addEventListener('click', startApp);
    console.log("✅ App logic loaded. Awaiting user interaction...");
}
