# fl/python_client.py
import tensorflow as tf
import numpy as np
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


# 🔥 SAFE FILE HASHING
def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8192), b''):
            h.update(block)
    return h.hexdigest()


# 🔥 LOCAL TRAINING FUNCTION
def local_train(model):
    X = np.random.randn(8, 160, 160, 3).astype("float32")
    y = np.array([1,0,1,1,0,1,0,0]).astype("float32")

    model.compile(optimizer="adam", loss="binary_crossentropy")
    model.fit(X, y, epochs=1, verbose=0)


print("\nFL CLIENT STARTED...\n")

while True:
    try:
        # 🔥 Reload global model fresh each round
        model = tf.keras.models.load_model(GLOBAL_MODEL_PATH, compile=False)

        # 🔥 Fetch current round from Node
        r = requests.get(f"{NODE_SERVER}/current-round").json()
        current_round = r["round"]

        print(f"\n🔄 Training for Round {current_round}")

        # Train locally
        local_train(model)

        # 🔥 ALWAYS PRODUCE VALID H5 FILES ONLY
        out_name = f"model_update_{int(time.time())}.h5"
        out_path = os.path.join(STORAGE_UPDATES, out_name)

        # Save update in correct Keras 3 compatible format
        model.save(out_path, include_optimizer=False)
        print("[CLIENT] Saved update:", out_path)

        # Correct weight size = total float parameters count
        total_size = sum([w.size for w in model.get_weights()])

        # File hash
        file_hash = sha256_of_file(out_path)

        # Construct JSON payload for Node server
        payload = {
            "weightsPath": out_path,
            "weightsHash": file_hash,
            "weightsSize": int(total_size),
            "round": current_round
        }

        print("[CLIENT] Sending update:", payload)

        res = requests.post(f"{NODE_SERVER}/submit-update", json=payload)
        print("[CLIENT] Server Response:", res.status_code, res.text)

    except Exception as e:
        print("❌ Error:", e)

    # Wait before sending next update
    time.sleep(10)
