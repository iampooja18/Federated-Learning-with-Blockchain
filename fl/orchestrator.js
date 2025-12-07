// fl/orchestrator.js
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { Web3 } = require("web3");

const {
    RPC_URL, CONTRACT_ADDRESS, ABI,
    OWNER_PRIVATE_KEY, STORAGE_MODELS,
    GLOBAL_MODEL_PATH, STORAGE_UPDATES
} = require("./config");

const { hashFile } = require("./utils");

const web3 = new Web3(RPC_URL);
const owner = web3.eth.accounts.privateKeyToAccount(OWNER_PRIVATE_KEY);
web3.eth.accounts.wallet.add(owner);

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

let ROUND = 1;

// ---------------------------------------------------------------------------
// Ensure global_model folder exists
// ---------------------------------------------------------------------------
const GLOBAL_FOLDER = path.join(__dirname, "../storage/global_model");
fs.mkdirSync(GLOBAL_FOLDER, { recursive: true });

// ---------------------------------------------------------------------------
// Resolve blockchain model URI → absolute path
// ---------------------------------------------------------------------------
function resolveUpdatePath(uri) {
    if (path.isAbsolute(uri)) return uri;
    return path.join(STORAGE_UPDATES, uri);
}

// ---------------------------------------------------------------------------
// Start Round
// ---------------------------------------------------------------------------
async function startRound() {
    console.log(`\n🚀 Starting Round ${ROUND} ...`);

    const hash = hashFile(GLOBAL_MODEL_PATH);

    await contract.methods.startRound(
        String(ROUND),
        GLOBAL_MODEL_PATH,
        hash
    ).send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} started`);
}

// ---------------------------------------------------------------------------
// Aggregate Round
// ---------------------------------------------------------------------------
async function aggregateRound() {
    const count = await contract.methods.getUpdateCount(String(ROUND)).call();

    if (Number(count) === 0) {
        console.log(`[ORCH] Round ${ROUND}: No updates received`);
        return;
    }

    console.log(`[ORCH] Aggregating ${count} updates...`);

    let updatePaths = [];
    let sizes = [];

    // ---------------------------------------------------------
    // FETCH updates & skip missing files (IMPORTANT FIX)
    // ---------------------------------------------------------
    for (let i = 0; i < Number(count); i++) {
        const u = await contract.methods.getUpdate(String(ROUND), i).call();
        const uri = u[1];
        const size = u[3];

        const localPath = resolveUpdatePath(uri);

        if (!fs.existsSync(localPath)) {
            console.log(`⚠️ Skipping missing update: ${localPath}`);
            continue;  // ← FIX: Skip instead of stopping
        }

        updatePaths.push(localPath);
        sizes.push(size);
    }

    if (updatePaths.length === 0) {
        console.log(`[ORCH] No valid updates available. Skipping aggregation.`);
        return;
    }

    // ---------------------------------------------------------
    // Create aggregation output folder
    // ---------------------------------------------------------
    const outFolder = path.join(STORAGE_MODELS, `round_${ROUND}_agg`);
    fs.mkdirSync(outFolder, { recursive: true });

    const outPath = path.join(outFolder, "model_agg.h5");

    // ---------------------------------------------------------
    // Run Python Aggregator
    // ---------------------------------------------------------
    const python = process.env.PYTHON || "python";
    const aggScript = path.resolve(__dirname, "aggregate_h5.py");

    const args = [aggScript, outPath, GLOBAL_MODEL_PATH];

    updatePaths.forEach((p, i) => {
        args.push(p);
        args.push(String(sizes[i]));
    });

    console.log("[ORCH] Running Python aggregator:\n", python, args.join(" "));
    const py = spawnSync(python, args, { stdio: "inherit" });

    if (py.status !== 0) {
        console.error("❌ Aggregator FAILED (exit:", py.status, ")");
        return;
    }

    const aggHash = hashFile(outPath);

    await contract.methods.closeRound(String(ROUND)).send({ from: owner.address });
    await contract.methods.storeAggregated(
        String(ROUND),
        outFolder,
        aggHash
    ).send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} aggregation complete`);
    console.log(`[ORCH] Aggregated model saved at: ${outPath}`);

    // ======================================================================
    // SAFE UPDATE OF GLOBAL MODEL (Windows + TensorFlow FIX)
    // ======================================================================
    try {
        // 1. Delete existing global model to avoid Windows lock error
        if (fs.existsSync(GLOBAL_MODEL_PATH)) {
            try {
                fs.unlinkSync(GLOBAL_MODEL_PATH);
            } catch (err) {
                console.log("[ORCH] Waiting for TF to release global model...");
                await new Promise(r => setTimeout(r, 2000));
                fs.unlinkSync(GLOBAL_MODEL_PATH);
            }
        }

        // 2. Wait a moment so Python releases file handles
        await new Promise(r => setTimeout(r, 1000));

        // 3. Copy new model safely
        fs.copyFileSync(outPath, GLOBAL_MODEL_PATH);
        console.log("[ORCH] Global model updated successfully!");

    } catch (err) {
        console.error("❌ Failed to update GLOBAL MODEL:", err);
        return;
    }

    // ----------------------------------------------------------------------
    // Save historical snapshot
    // ----------------------------------------------------------------------
    const roundCopy = path.join(GLOBAL_FOLDER, `round_${ROUND}_model.h5`);
    fs.copyFileSync(outPath, roundCopy);

    console.log(`[ORCH] Saved round snapshot: ${roundCopy}`);

    ROUND++;
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------
async function loop() {
    await startRound();

    setTimeout(async () => {
        await aggregateRound();
        setTimeout(loop, 5000);
    }, 12000);
}

loop();

