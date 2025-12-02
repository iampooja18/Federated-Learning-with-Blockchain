import tensorflow as tf
import numpy as np
import json
import requests
import time
import hashlib
import os

# Resolve absolute path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "storage", "cat_dog_safe_mobilenetv2.h5"))

print("Loading model from:", MODEL_PATH)

# Load model
model = tf.keras.models.load_model(MODEL_PATH)
print("Loaded model successfully!")

SERVER_URL = "http://127.0.0.1:5000/submit"

def flatten_weights(model):
    flat = []
    for w in model.get_weights():
        flat.extend(w.flatten().tolist())
    return flat

def unflatten_weights(model, flat):
    new_weights = []
    idx = 0
    for w in model.get_weights():
        size = np.prod(w.shape)
        new_w = np.array(flat[idx: idx + size]).reshape(w.shape)
        new_weights.append(new_w)
        idx += size
    model.set_weights(new_weights)

def local_train(model):
    # MobilenetV2 input size
    X = np.random.randn(8, 160, 160, 3).astype("float32")

    # Binary labels (NOT one-hot)
    y = np.array([1,0,1,1,0,1,0,0]).astype("float32")

    model.compile(
        optimizer="adam",
        loss="binary_crossentropy"
    )

    model.fit(X, y, epochs=1, verbose=0)


def sha256_of_list(arr):
    return hashlib.sha256(json.dumps(arr).encode()).hexdigest()

while True:
    print("\n🔄 NEW ROUND")

    local_train(model)
    updated = flatten_weights(model)
    weight_hash = sha256_of_list(updated)

    payload = {
        "weights": updated,
        "hash": weight_hash
    }

    try:
        response = requests.post(SERVER_URL, json=payload)
        print("Server response:", response.text)
    except Exception as e:
        print("❌ Error sending update:", e)

    time.sleep(10)
