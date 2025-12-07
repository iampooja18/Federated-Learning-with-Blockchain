# fl/aggregate_h5.py
# Usage:
# python3 aggregate_h5.py <out_path> <global_model_path> <update1_json> <size1> <update2_json> <size2> ...

import sys
import os
import json
import numpy as np
import tensorflow as tf
import keras


def load_json_weights(path):
    with open(path, "r", encoding="utf-8") as f:  # <-- add encoding="utf-8" here
        data = json.load(f)
    return data


def weighted_average(weight_sets, sizes):
    total = sum(sizes)
    factors = [s / total for s in sizes]

    averaged = []
    for layer_idx in range(len(weight_sets[0])):
        layer_sum = np.zeros_like(weight_sets[0][layer_idx], dtype=np.float64)

        for w, f in zip(weight_sets, factors):
            layer_sum += w[layer_idx].astype(np.float64) * f

        averaged.append(layer_sum.astype(np.float32))

    return averaged

def main():
    if len(sys.argv) < 5 or (len(sys.argv) - 3) % 2 != 0:
        print("Usage: python3 aggregate_h5.py <out_path> <global_model_path> <update1_json> <size1> ...")
        sys.exit(2)

    out_path = sys.argv[1]
    global_model_path = sys.argv[2]
    args = sys.argv[3:]

    update_paths = args[0::2]
    sizes = list(map(int, args[1::2]))

    print("\n[Aggregator] Update files:", update_paths)
    print("[Aggregator] Sizes:", sizes)

    # Load global model (.h5)
    base_model = keras.models.load_model(global_model_path)
    base_weights = base_model.get_weights()

    # Load all JSON update weights
    weight_sets = []
    for p in update_paths:
        if not os.path.exists(p):
            print(f"[ERROR] Update file missing: {p}")
            sys.exit(3)

        update_model = keras.models.load_model(p)
        ws = update_model.get_weights()
        weight_sets.append(ws)

       

    # Validate shape compatibility
    for i, ws in enumerate(weight_sets):
        if len(ws) != len(base_weights):
            print(f"[ERROR] Layer count mismatch in {update_paths[i]}")
            sys.exit(4)

        for a, b in zip(ws, base_weights):
            if a.shape != b.shape:
                print(f"[ERROR] Shape mismatch in {update_paths[i]}: {a.shape} vs global {b.shape}")
                sys.exit(5)

    # Perform weighted average aggregation
    averaged_weights = weighted_average(weight_sets, sizes)
    # Apply averaged weights
    base_model.set_weights(averaged_weights)

    # Compile the model to remove warnings
    base_model.compile(
    optimizer='adam',            # or the optimizer you want
    loss='binary_crossentropy',  # or your model's loss
    metrics=['accuracy']         # or metrics you care about
    )


    # Save updated global model
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    base_model.save(out_path, include_optimizer=False)

    print("\n[Aggregator] Aggregation complete!")
    print("[Aggregator] Saved updated model to:", out_path)

if __name__ == "__main__":
    main()
