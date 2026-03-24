// Wrapping everything in DOMContentLoaded to ensure elements are ready
document.addEventListener('DOMContentLoaded', () => {
    // Global error listener for debugging
    window.addEventListener('error', function (event) {
        console.error('🔥 Global Error:', event.error);
        const predText = document.getElementById('prediction-text');
        if (predText) predText.textContent = 'Script Error: Check Console';
    });

    const videoElement = document.getElementsByClassName('input_video')[0];
    const canvasElement = document.getElementsByClassName('output_canvas')[0];
    const canvasCtx = canvasElement.getContext('2d');
    const predictionText = document.getElementById('prediction-text');
    const startBtn = document.getElementById('start-btn');
    const recordBtn = document.getElementById('record-gesture-btn');
    const manageBtn = document.getElementById('manage-gestures-btn');
    const muteBtn = document.getElementById('mute-btn');
    const muteIcon = document.getElementById('mute-icon');
    const recordingOverlay = document.getElementById('recording-overlay');
    const recordingTimer = document.getElementById('recording-timer');
    const recordingMsg = document.getElementById('recording-msg');
    const recordingProgress = document.getElementById('recording-progress');
    const gestureModal = document.getElementById('gesture-modal');
    const gestureInput = document.getElementById('gesture-name-input');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    
    // Manage Modal Elements
    const manageModal = document.getElementById('manage-modal');
    const gesturesList = document.getElementById('gestures-list');
    const manageCloseBtn = document.getElementById('manage-close-btn');

    // Confirm Modal Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMsg = document.getElementById('confirm-msg');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

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

    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (db.objectStoreNames.contains(STORE_NAME)) {
            db.deleteObjectStore(STORE_NAME);
        }
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        console.log("📦 IndexedDB Ready.");
        refreshCustomGestures();
    };
    request.onerror = (e) => console.error("❌ IndexedDB Error:", e);

    async function refreshCustomGestures() {
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                loadedCustomGestures = request.result;
                console.log(`🔄 Loaded ${loadedCustomGestures.length} custom gestures.`);
                resolve(loadedCustomGestures);
            };
            request.onerror = () => resolve([]);
        });
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
        if (!gestureModal || !gestureInput) {
            console.error("❌ Modal elements missing");
            return;
        }
        // Show modal instead of prompt
        gestureModal.style.display = 'flex';
        gestureInput.value = "CustomGesture";
        gestureInput.focus();
        if (gestureInput.select) gestureInput.select();
    }

    // Modal Events
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const gestureName = gestureInput.value.trim();
            if (!gestureName) return alert("Please enter a name.");
            gestureModal.style.display = 'none';
            
            if (recordingOverlay) {
                recordingOverlay.style.display = 'flex';
                recordingMsg.textContent = "Prepare to record...";
                recordingTimer.textContent = "3";
                recordingProgress.style.width = "0%";
                recordingOverlay.classList.remove('recording-active');
            }

            let countdown = 3;
            const interval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    if (recordingTimer) recordingTimer.textContent = countdown;
                } else {
                    clearInterval(interval);
                    startCapture(gestureName);
                }
            }, 1000);
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            gestureModal.style.display = 'none';
        });
    }

    // --- NEW: MANAGE GESTURES LOGIC ---

    if (manageBtn) {
        manageBtn.addEventListener('click', openManageModal);
    }
    
    if (manageCloseBtn) {
        manageCloseBtn.addEventListener('click', () => {
            if (manageModal) manageModal.style.display = 'none';
        });
    }

    async function openManageModal() {
        manageModal.style.display = 'flex';
        renderGesturesList();
    }

    async function renderGesturesList() {
        gesturesList.innerHTML = '<p style="text-align: center; opacity: 0.5;">Loading gestures...</p>';
        const customGestures = await refreshCustomGestures(); // Now refreshCustomGestures returns the list

        if (customGestures.length === 0) {
            gesturesList.innerHTML = '<p style="text-align: center; opacity: 0.5;">No custom gestures found.</p>';
            return;
        }

        gesturesList.innerHTML = '';
        customGestures.forEach(g => {
            const item = document.createElement('div');
            item.className = 'gesture-item';
            item.innerHTML = `
                <div class="gesture-info">
                    <span class="gesture-name">${g.name}</span>
                    <span class="gesture-meta">${g.data.length} frames recorded</span>
                </div>
                <button class="delete-btn" data-gesture-name="${g.name}">Delete</button>
            `;
            gesturesList.appendChild(item);
        });

        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const gestureName = event.target.dataset.gestureName;
                handleDeleteGesture(gestureName);
            });
        });
    }

    async function handleDeleteGesture(name) {
        confirmMsg.textContent = `Are you sure you want to delete "${name}"? This will re-train the model.`;
        confirmModal.style.display = 'flex';

        // Set up one-time event listeners for the modal
        const onConfirm = async () => {
            confirmModal.style.display = 'none';
            confirmOkBtn.removeEventListener('click', onConfirm);
            confirmCancelBtn.removeEventListener('click', onCancel);
            await performDeletion(name);
        };

        const onCancel = () => {
            confirmModal.style.display = 'none';
            confirmOkBtn.removeEventListener('click', onConfirm);
            confirmCancelBtn.removeEventListener('click', onCancel);
        };

        confirmOkBtn.addEventListener('click', onConfirm);
        confirmCancelBtn.addEventListener('click', onCancel);
    }

    async function performDeletion(name) {
        const deleteBtns = document.querySelectorAll('.delete-btn');
        deleteBtns.forEach(b => b.disabled = true);
        
        try {
            const token = localStorage.getItem('isl_token');
            if (!token) {
                alert("You are not logged in. Please log in to delete gestures.");
                window.location.href = 'login.html';
                return;
            }

            const response = await fetch(`/delete-gesture/${name}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log(`🗑️ Deletion response for "${name}":`, response.status);

            if (response.ok) {
                // Also remove from local IndexedDB
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, "readwrite");
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.delete(name);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                
                alert(`Gesture "${name}" deleted! Model re-training started in background.`);
                renderGesturesList(); // Refresh list
                refreshCustomGestures(); // Refresh cache
                checkTrainingStatus(); // Start polling
            } else {
                const err = await response.json();
                alert("Deletion failed: " + (err.detail || "Unknown error"));
            }
        } catch (error) {
            console.error("Deletion error:", error);
            alert("An error occurred during deletion. Please check console.");
        } finally {
            deleteBtns.forEach(b => b.disabled = false);
        }
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
        const gestureName = recordingMsg.textContent.match(/"([^"]+)"/)[1];
        saveGesture(gestureName);
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
        store.put(gesture); // Use put instead of add to allow updating if name exists
        transaction.oncomplete = async () => {
            console.log("💾 Gesture saved to IndexedDB.");
            refreshCustomGestures(); // Refresh cache
            
            // --- NEW: Sync with Backend and Train ---
            const token = localStorage.getItem('isl_token');
            if (!token) {
                alert("Gesture saved locally, but you are not logged in. Please log in to sync with server.");
                return;
            }

            try {
                predictionText.textContent = "Uploading gesture to server...";
                const uploadResponse = await fetch("/upload-gesture", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ 
                        gesture_name: name,
                        landmarks: recordedFrames 
                    })
                });

                if (uploadResponse.ok) {
                    const data = await uploadResponse.json();
                    alert(`✅ Gesture "${name}" saved! ${data.message || 'Training started in background.'}`);
                    predictionText.textContent = "Training in background...";
                    
                    // Start polling for status
                    checkTrainingStatus();
                } else {
                    throw new Error("Upload failed");
                }
            } catch (err) {
                console.error("Sync Error:", err);
                alert(`⚠️ Gesture saved locally, but server sync/training failed: ${err.message}`);
                predictionText.textContent = "Sync Error";
            }
        };
    }

    async function checkTrainingStatus() {
        try {
            const response = await fetch("/training-status");
            const data = await response.json();
            if (data.is_training) {
                if (predictionText) predictionText.textContent = "⚙️ Training Model...";
                setTimeout(checkTrainingStatus, 5000); // Check every 5s
            } else {
                if (predictionText) {
                    const oldText = predictionText.textContent;
                    if (oldText === "⚙️ Training Model..." || oldText === "Training in background...") {
                        predictionText.textContent = "✅ Model Ready";
                        
                        // Show Browser Notification
                        if ("Notification" in window && Notification.permission === "granted") {
                            new Notification("ISL Sign Language Recognition", {
                                body: "Model re-training complete! You can now use your new gestures.",
                                icon: "icon.svg"
                            });
                        }

                        setTimeout(() => {
                            if (predictionText.textContent === "✅ Model Ready") {
                                predictionText.textContent = "Ready";
                            }
                        }, 5000);
                    }
                }
            }
        } catch (e) {
            console.error("Status check failed:", e);
        }
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

    // --- AUTHENTICATION & UI ---
    const logoutBtn = document.getElementById('logout-btn');
    const userNameSpan = document.getElementById('user-name');

    if (userNameSpan) {
        userNameSpan.textContent = localStorage.getItem('isl_user') || 'User';
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('isl_token');
            localStorage.removeItem('isl_user');
            window.location.href = 'login.html';
        });
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
        const token = localStorage.getItem('isl_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const response = await fetch("/predict", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ landmarks: allFeatures })
            });

            if (response.status === 401) {
                localStorage.removeItem('isl_token');
                window.location.href = 'login.html';
                return;
            }

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
                // Show custom controls
                muteBtn.style.display = 'block';
                recordBtn.style.display = 'block';
                manageBtn.style.display = 'block';
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

    if (recordBtn) {
        recordBtn.addEventListener('click', startRecordingWithCountdown);
    }

    startBtn.addEventListener('click', () => {
        startApp();
        // Request notification permission early
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    });
    console.log("✅ App logic loaded. Awaiting user interaction...");
});
