# fl/python_client.py
import tensorflow as tf
import numpy as np
import json
import requests
import time
import hashlib
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_UPDATES = os.path.abspath(os.path.join(BASE_DIR, "../storage/updates/python_client"))
GLOBAL_MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, "../storage/global_fed_model.h5"))
SERVER_URL = "http://127.0.0.1:5000/submit-update"

os.makedirs(STORAGE_UPDATES, exist_ok=True)

print("Using global model path:", GLOBAL_MODEL_PATH)

# Load model (Keras .h5)
model = tf.keras.models.load_model(GLOBAL_MODEL_PATH)
print("Loaded model successfully!")

def local_train(model):
    # Use small random tensors to simulate training
    X = np.random.randn(8, 160, 160, 3).astype("float32")
    y = np.array([1,0,1,1,0,1,0,0]).astype("float32")

    model.compile(optimizer="adam", loss="binary_crossentropy")
    model.fit(X, y, epochs=1, verbose=0)

def sha256_of_file(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

while True:
    try:
        # Reload global model each round to ensure latest global weights
        model = tf.keras.models.load_model(GLOBAL_MODEL_PATH)

        print("\n🔄 Local training started")
        local_train(model)

        # Save updated model to a new .h5 file
        out_name = f"model_update_{int(time.time())}.h5"
        out_path = os.path.join(STORAGE_UPDATES, out_name)
        model.save(out_path, include_optimizer=False)
        print("[CLIENT] Saved update to:", out_path)

        # Compute hash and size (size = number of floats across weights)
        # To calculate size, sum elements across all weight arrays:
        total_size = sum([int(np.prod(w.shape)) for w in model.get_weights()])
        h = sha256_of_file(out_path)

        payload = {
            "weightsPath": out_path,
            "weightsHash": h,
            "weightsSize": int(total_size)
        }

        print("[CLIENT] Sending update metadata to node server:", payload)
        resp = requests.post(SERVER_URL, json=payload, timeout=10)
        print("[CLIENT] Server response:", resp.status_code, resp.text)

    except Exception as e:
        print("❌ Error in client loop:", e)

    time.sleep(10)
