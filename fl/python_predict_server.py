from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
from PIL import Image
import os, io, json, hashlib, time

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "../storage/models/global_fed_model.h5")
UPDATE_DIR = os.path.join(BASE_DIR, "../storage/updates/python_client")

os.makedirs(UPDATE_DIR, exist_ok=True)

print("⏳ Waiting for global model:", MODEL_PATH)
while not os.path.exists(MODEL_PATH):
    time.sleep(5)

print("✅ Global model found:", MODEL_PATH)

model = tf.keras.models.load_model(MODEL_PATH, compile=False)
model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
print("🚀 Model loaded & compiled")

def flatten_weights(model):
    flat = []
    for w in model.get_weights():
        flat.extend(w.flatten().tolist())
    return flat

@app.post("/predict")
def predict():
    try:
        img_bytes = request.data
        if not img_bytes:
            return jsonify({"success": False, "message": "Empty image"}), 400

        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img = img.resize((160, 160))

        X = np.expand_dims(np.array(img) / 255.0, axis=0)

        prob = float(model.predict(X)[0][0])

        # 🔴 ADD THIS BLOCK (HUMAN / UNKNOWN REJECTION)
        if 0.2 < prob < 0.8:
            return jsonify({
                "success": False,
                "error": "Unsupported image. Only Cat or Dog allowed.",
                "score": prob
            }), 422
        # 🔴 END BLOCK

        label = "Dog" if prob > 0.5 else "Cat"

        y = np.array([[1]]) if label == "Dog" else np.array([[0]])
        model.fit(X, y, epochs=1, verbose=0)

        flat = flatten_weights(model)
        h = hashlib.sha256(json.dumps(flat).encode()).hexdigest()

        weights_path = os.path.join(
            UPDATE_DIR, f"update_{h[:12]}.json"
        )

        with open(weights_path, "w") as f:
            json.dump({"weights": flat}, f)

        return jsonify({
            "success": True,
            "label": label,
            "score": prob,
            "weightsPath": weights_path,
            "weightsHash": h,
            "weightsSize": len(flat),
            "clientId": "frontend_client",
            "round": 1
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


app.run(port=7000)
