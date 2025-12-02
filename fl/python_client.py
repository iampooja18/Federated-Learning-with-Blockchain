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

NODE_SERVER = "http://127.0.0.1:5000"

os.makedirs(STORAGE_UPDATES, exist_ok=True)

print("Loading global model:", GLOBAL_MODEL_PATH)
model = tf.keras.models.load_model(GLOBAL_MODEL_PATH)

def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def local_train(model):
    X = np.random.randn(8, 160, 160, 3).astype("float32")
    y = np.array([1,0,1,1,0,1,0,0]).astype("float32")

    model.compile(optimizer="adam", loss="binary_crossentropy")
    model.fit(X, y, epochs=1, verbose=0)

print("\nFL CLIENT STARTED...\n")

while True:
    try:
        # Reload global model
        model = tf.keras.models.load_model(GLOBAL_MODEL_PATH)

        # 🔥 Fetch live round from blockchain via Node
        r = requests.get(f"{NODE_SERVER}/current-round").json()
        current_round = r["round"]

        print(f"\n🔄 Training for Round {current_round}")

        local_train(model)

        out_name = f"model_update_{int(time.time())}.h5"
        out_path = os.path.join(STORAGE_UPDATES, out_name)
        model.save(out_path, include_optimizer=False)

        print("[CLIENT] Saved update:", out_path)

        total_size = sum([int(np.prod(w.shape)) for w in model.get_weights()])
        h = sha256_of_file(out_path)

        payload = {
            "weightsPath": out_path,
            "weightsHash": h,
            "weightsSize": int(total_size),
            "round": current_round
        }

        print("[CLIENT] Sending update:", payload)

        res = requests.post(f"{NODE_SERVER}/submit-update", json=payload)
        print("[CLIENT] Server Response:", res.status_code, res.text)

    except Exception as e:
        print("❌ Error:", e)

    time.sleep(10)
