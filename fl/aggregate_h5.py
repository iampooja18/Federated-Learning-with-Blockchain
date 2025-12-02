# fl/aggregate_h5.py
# Usage:
# python3 aggregate_h5.py <out_path> <global_model_path> <update1_path> <size1> <update2_path> <size2> ...
import sys
import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model, save_model

def load_weights_list(h5_path):
    m = load_model(h5_path)
    return [w.copy() for w in m.get_weights()]

def deep_copy_weights(weights):
    return [np.array(w) for w in weights]

def weighted_average(weight_sets, sizes):
    total = sum(sizes)
    # Convert sizes to float weights
    factors = [s / total for s in sizes]
    # assume all weight_sets have same length and shapes
    avg = []
    for layer_idx in range(len(weight_sets[0])):
        # start with zeros of correct shape
        accum = np.zeros_like(weight_sets[0][layer_idx], dtype=np.float64)
        for ws, f in zip(weight_sets, factors):
            accum += ws[layer_idx].astype(np.float64) * f
        avg.append(accum.astype(np.float32))
    return avg

def main():
    if len(sys.argv) < 5 or (len(sys.argv) - 3) % 2 != 0:
        print("Usage: python3 aggregate_h5.py <out_path> <global_model_path> <update1_path> <size1> [<update2_path> <size2> ...]")
        sys.exit(2)

    out_path = sys.argv[1]
    global_model_path = sys.argv[2]
    args = sys.argv[3:]

    update_paths = args[0::2]
    sizes = list(map(int, args[1::2]))
    print("Aggregator received updates:", update_paths)
    print("Sizes:", sizes)

    # Load base (global) model to get architecture
    base_model = load_model(global_model_path)
    base_weights = base_model.get_weights()

    # Load all update weights into numpy arrays
    weight_sets = []
    for p in update_paths:
        if not os.path.exists(p):
            print(f"Update file missing: {p}")
            sys.exit(3)
        ws = load_model(p).get_weights()
        weight_sets.append([np.array(w) for w in ws])

    # Some safeguards: ensure shapes match
    for i, ws in enumerate(weight_sets):
        if len(ws) != len(base_weights):
            print(f"Shape mismatch: update {update_paths[i]} has {len(ws)} weight arrays, base has {len(base_weights)}")
            sys.exit(4)
        for a, b in zip(ws, base_weights):
            if a.shape != b.shape:
                print(f"Layer shape mismatch between {update_paths[i]} and base: {a.shape} vs {b.shape}")
                sys.exit(5)

    # Weighted average
    averaged = weighted_average(weight_sets, sizes)

    # Assign averaged weights to base model and save
    base_model.set_weights(averaged)
    # Ensure output directory exists
    out_dir = os.path.dirname(out_path)
    os.makedirs(out_dir, exist_ok=True)
    base_model.save(out_path, include_optimizer=False)
    print("Aggregated model written to:", out_path)

if __name__ == "__main__":
    main()
