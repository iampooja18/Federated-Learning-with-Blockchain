// fl/orchestrator.js
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { Web3 } = require("web3");

const {
    RPC_URL, CONTRACT_ADDRESS, ABI,
    OWNER_PRIVATE_KEY, STORAGE_MODELS,
    GLOBAL_MODEL_PATH
} = require("./config");

const { hashFile } = require("./utils");

const web3 = new Web3(RPC_URL);
const owner = web3.eth.accounts.privateKeyToAccount(OWNER_PRIVATE_KEY);
web3.eth.accounts.wallet.add(owner);
const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

let ROUND = 1;

async function startRound() {
    console.log(`\n🚀 Starting Round ${ROUND} ...`);

    const hash = hashFile(GLOBAL_MODEL_PATH);

    // string conversion for web3 v4 compatibility
    const roundStr = String(ROUND);

    await contract.methods.startRound(
        roundStr,
        GLOBAL_MODEL_PATH,
        hash
    ).send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} started`);
}

async function aggregateRound() {
    // getUpdateCount expects a compatible type - pass string
    const count = await contract.methods.getUpdateCount(String(ROUND)).call();

    if (Number(count) === 0) {
        console.log(`[ORCH] Round ${ROUND}: No updates received`);
        return;
    }

    console.log(`[ORCH] Aggregating ${count} updates...`);

    // Collect update URIs and sizes
    let uris = [];
    let sizes = [];
    for (let i = 0; i < Number(count); i++) {
        // getUpdate(round, index) - pass round as string
        const res = await contract.methods.getUpdate(String(ROUND), i).call();
        // getUpdate returns tuple: (address, string uri, string hash, uint256 dataSize)
        // Ensure we access fields correctly:
        // res[0] = client, res[1] = uri, res[2] = hash, res[3] = size
        const uri = res[1];
        const size = res[3];
        uris.push(uri);
        sizes.push(size);
    }

    // Create output folder for aggregated model
    const outFolder = path.join(STORAGE_MODELS, `round_${ROUND}_agg`);
    fs.mkdirSync(outFolder, { recursive: true });
    const outPath = path.join(outFolder, "model_agg.h5");

    // Build Python aggregator args
    // Use process.env.PYTHON to prefer 'python' or 'python3' depending on env
    const pythonBin = process.env.PYTHON || "python";
    const aggScript = path.resolve(__dirname, "aggregate_h5.py");

    // args: <out_path> <global_model_path> <update1_path> <size1> ...
    const args = [aggScript, outPath, GLOBAL_MODEL_PATH];
    for (let i = 0; i < uris.length; i++) {
        args.push(uris[i]);
        args.push(String(sizes[i]));
    }

    console.log("[ORCH] Running Python aggregator:", pythonBin, args.join(" "));
    const py = spawnSync(pythonBin, args, { stdio: "inherit" });

    if (py.status !== 0) {
        console.error("[ORCH] Python aggregator failed (exit code)", py.status);
        return;
    }

    // After aggregator completes, compute hash of aggregated .h5
    const newHash = hashFile(outPath);

    // convert numeric params to strings for web3 v4
    const roundStr = String(ROUND);

    await contract.methods.closeRound(roundStr).send({ from: owner.address });

    // storeAggregated takes (roundId, uri, hash)
    // For uri we store outFolder so clients can find model_agg.h5 inside it
    await contract.methods.storeAggregated(roundStr, outFolder, newHash).send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} aggregation complete. Stored at: ${outPath}`);

    // overwrite global model for next round
    fs.copyFileSync(outPath, GLOBAL_MODEL_PATH);

    ROUND++;
}

async function loop() {
    await startRound();

    setTimeout(async () => {
        await aggregateRound();
        setTimeout(loop, 5000);
    }, 15000);
}

loop();

