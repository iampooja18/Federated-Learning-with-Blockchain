import sys
import os
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras


# =====================================================
# Load JSON raw weight list
# =====================================================
def load_json_weights(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Ensure list of numpy arrays
    return [np.array(w, dtype=np.float32) for w in data]


# =====================================================
# Federated Weighted Average (FedAvg)
# =====================================================
def weighted_average(weight_sets, sizes):
    if len(weight_sets) == 0:
        raise ValueError("No weight sets provided for aggregation")

    # Default equal weighting if sizes missing or invalid
    if not sizes or len(sizes) != len(weight_sets):
        sizes = [1 for _ in weight_sets]

    total = float(sum(sizes))
    factors = [s / total for s in sizes]

    averaged = []
    num_layers = len(weight_sets[0])

    for layer_idx in range(num_layers):
        layer_sum = np.zeros_like(
            weight_sets[0][layer_idx],
            dtype=np.float64
        )

        for w, f in zip(weight_sets, factors):
            layer_sum += w[layer_idx].astype(np.float64) * f

        averaged.append(layer_sum.astype(np.float32))

    return averaged


# =====================================================
# MAIN
# =====================================================
def main():
    """
    Usage:
    python aggregate_h5.py <out_model_path> <base_global_model>
        <update1> <size1> <update2> <size2> ...
    """

    if len(sys.argv) < 4:
        print("Usage:")
        print("  python aggregate_h5.py <out_model> <base_model> <update1> <size1> ...")
        sys.exit(2)

    out_path = sys.argv[1]
    base_model_path = sys.argv[2]
    args = sys.argv[3:]

    if len(args) % 2 != 0:
        print("[ERROR] Updates and sizes must be paired")
        sys.exit(3)

    update_paths = args[0::2]
    sizes = list(map(int, args[1::2]))

    print("\n[Aggregator] Base global model:", base_model_path)
    print("[Aggregator] Update files:", update_paths)
    print("[Aggregator] Sample sizes:", sizes)

    # =====================================================
    # Load base global model
    # =====================================================
    if not os.path.exists(base_model_path):
        print("[ERROR] Base global model not found:", base_model_path)
        sys.exit(4)

    base_model = keras.models.load_model(base_model_path)
    base_weights = base_model.get_weights()

    weight_sets = []

    # =====================================================
    # Load client updates
    # =====================================================
    for p in update_paths:
        if not os.path.exists(p):
            print(f"[ERROR] Update file missing: {p}")
            sys.exit(5)

        if p.endswith(".json"):
            print(f"[Aggregator] Loading JSON weights: {p}")
            ws = load_json_weights(p)
        elif p.endswith(".h5") or p.endswith(".keras"):
            print(f"[Aggregator] Loading Keras model: {p}")
            update_model = keras.models.load_model(p)
            ws = update_model.get_weights()
        else:
            print(f"[ERROR] Unsupported update format: {p}")
            sys.exit(6)

        weight_sets.append(ws)

    # =====================================================
    # Validate compatibility
    # =====================================================
    for idx, ws in enumerate(weight_sets):
        if len(ws) != len(base_weights):
            print(f"[ERROR] Layer count mismatch in update: {update_paths[idx]}")
            sys.exit(7)

        for l_idx, (a, b) in enumerate(zip(ws, base_weights)):
            if a.shape != b.shape:
                print(
                    f"[ERROR] Shape mismatch in {update_paths[idx]} "
                    f"layer {l_idx}: {a.shape} vs {b.shape}"
                )
                sys.exit(8)

    # =====================================================
    # FedAvg aggregation
    # =====================================================
    averaged_weights = weighted_average(weight_sets, sizes)
    base_model.set_weights(averaged_weights)

    # =====================================================
    # Compile (required for save, metrics irrelevant)
    # =====================================================
    base_model.compile(
        optimizer="adam",
        loss="binary_crossentropy",
        metrics=["accuracy"]
    )

    # =====================================================
    # Save aggregated global model (OFF-CHAIN)
    # =====================================================
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    base_model.save(out_path, include_optimizer=False)

    print("\n[Aggregator] ✅ Aggregation complete")
    print("[Aggregator] Global model saved to:", out_path)


if __name__ == "__main__":
    main()
