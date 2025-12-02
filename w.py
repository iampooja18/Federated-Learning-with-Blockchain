import tensorflow as tf
import json
import numpy as np

# ⚠️ Change to your actual file name if different
MODEL_PATH = "storage\cat_dog_safe_mobilenetv2.h5"
OUT_PATH = "weights.json"

print("Loading model:", MODEL_PATH)
model = tf.keras.models.load_model(MODEL_PATH)

weights = model.get_weights()

flat_list = []

for w in weights:
    flat_list.extend(w.flatten().tolist())

print("Total Weights:", len(flat_list))

with open(OUT_PATH, "w") as f:
    json.dump({"weights": flat_list}, f)

print("Saved weights to:", OUT_PATH)
