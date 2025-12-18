import tensorflow as tf
import numpy as np
import requests
import time
import hashlib
import os
import socket

# ======================================================
# PATHS
# ======================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STORAGE_UPDATES = os.path.abspath(
    os.path.join(BASE_DIR, "../storage/updates/python_client")
)

STORAGE_MODELS = os.path.abspath(
    os.path.join(BASE_DIR, "../storage/models")
)

# Bootstrap global model created by orchestrator
BOOTSTRAP_MODEL = os.path.join(
    STORAGE_MODELS,
    "global_fed_model.h5"
)

NODE_SERVER = "http://127.0.0.1:5000"

os.makedirs(STORAGE_UPDATES, exist_ok=True)
os.makedirs(STORAGE_MODELS, exist_ok=True)

# ======================================================
# UNIQUE CLIENT ID
# ======================================================
CLIENT_ID = socket.gethostname() + "_" + str(os.getpid())
print("FL CLIENT ID:", CLIENT_ID)

# ======================================================
# SAFE FILE HASHING
# ======================================================
def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8192), b""):
            h.update(block)
    return h.hexdigest()

# ======================================================
# GLOBAL MODEL RESOLUTION (CORRECT FL LOGIC)
# ======================================================
def resolve_global_model(round_num):
    """
    Round 1  -> bootstrap model
    Round >=2 -> aggregated model from previous round
    """
    if round_num == 1:
        return BOOTSTRAP_MODEL

    return os.path.join(
        STORAGE_MODELS,
        f"round_{round_num - 1}_agg",
        "model_agg.h5"
    )

# ======================================================
# LOCAL TRAINING
# ======================================================
def local_train(model):
    X = np.random.randn(8, 160, 160, 3).astype("float32")
    y = np.array([[1], [0], [1], [1], [0], [1], [0], [0]]).astype("float32")
    model.fit(X, y, epochs=1, verbose=0)

print("\n🚀 FL CLIENT STARTED...\n")

# ======================================================
# MAIN LOOP
# ======================================================
while True:
    try:
        # --------------------------------------------------
        # FETCH CURRENT ROUND FROM SERVER (BLOCKCHAIN TRUTH)
        # --------------------------------------------------
        try:
            r = requests.get(f"{NODE_SERVER}/current-round", timeout=5).json()
            current_round = int(r["round"])
        except Exception:
            print("⚠️ Server unreachable. Retrying...")
            time.sleep(5)
            continue

        print(f"\n🔄 Client {CLIENT_ID} training for Round {current_round}")

        # --------------------------------------------------
        # RESOLVE CORRECT GLOBAL MODEL
        # --------------------------------------------------
        global_model_path = resolve_global_model(current_round)

        if not os.path.exists(global_model_path):
            print("⏳ Waiting for global model file...")
            time.sleep(5)
            continue

        # --------------------------------------------------
        # LOAD + COMPILE MODEL
        # --------------------------------------------------
        model = tf.keras.models.load_model(global_model_path, compile=False)
        model.compile(
            optimizer="adam",
            loss="binary_crossentropy",
            metrics=["accuracy"]
        )

        # --------------------------------------------------
        # LOCAL TRAINING
        # --------------------------------------------------
        local_train(model)

        # --------------------------------------------------
        # SAVE MODEL UPDATE
        # --------------------------------------------------
        out_name = f"model_update_{CLIENT_ID}_{int(time.time())}.h5"
        out_path = os.path.join(STORAGE_UPDATES, out_name)

        model.save(out_path, include_optimizer=False)
        print("[CLIENT] Saved update:", out_path)

        # --------------------------------------------------
        # SEND UPDATE METADATA TO SERVER
        # --------------------------------------------------
        payload = {
            "clientId": CLIENT_ID,
            "weightsPath": out_path,
            "weightsHash": sha256_of_file(out_path),
            "weightsSize": sum(w.size for w in model.get_weights()),
            "round": current_round
        }

        res = requests.post(
            f"{NODE_SERVER}/submit-update",
            json=payload,
            timeout=10
        )

        print("[CLIENT] Server response:", res.status_code, res.text)

    except Exception as e:
        print("❌ Client error:", e)

    time.sleep(10)
