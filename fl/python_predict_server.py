from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
from PIL import Image
import json, hashlib, os, io

# Force eager execution (fixes numpy() errors)
tf.config.run_functions_eagerly(True)

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "../storage/global_fed_model.h5")
UPDATE_DIR = os.path.join(BASE_DIR, "../storage/updates/python_client")

os.makedirs(UPDATE_DIR, exist_ok=True)

print("Loading model:", MODEL_PATH)
model = tf.keras.models.load_model(MODEL_PATH)
print("Model loaded successfully!")


def flatten(model):
    flat = []
    for w in model.get_weights():
        flat.extend(w.flatten().tolist())
    return flat


@app.post("/predict")
def predict():
    try:
        # Read raw bytes sent by Node.js
        img_bytes = request.data
        if not img_bytes:
            return jsonify({"success": False, "message": "No image received"}), 400

        # Convert bytes → PIL image
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img = img.resize((160, 160))

        X = np.expand_dims(np.array(img) / 255.0, 0)

        # Predict
        prob = float(model.predict(X)[0][0])
        label = "Dog" if prob > 0.5 else "Cat"

        # Local training
        y = np.array([[1]]) if label == "Dog" else np.array([[0]])
        model.compile(optimizer="adam", loss="binary_crossentropy")
        model.fit(X, y, epochs=1, verbose=0)

        # Flatten & hash
        flat = flatten(model)
        h = hashlib.sha256(json.dumps(flat).encode()).hexdigest()

        weights_path = os.path.join(UPDATE_DIR, f"weights_{h[:12]}.json")
        json.dump({"weights": flat}, open(weights_path, "w"))

        

        return jsonify({
            "success": True,
            "label": label,
            "score": prob,
            "weightsPath": weights_path,
            "weightsHash": h,
            "weightsSize": len(flat),
        })

    except Exception as e:
        return jsonify({"success": False, "message": "Prediction failed", "error": str(e)}), 500


app.run(port=6000)