const fs = require("fs");
const path = require("path");
const { Web3 } = require("web3");

const {
    RPC_URL, CONTRACT_ADDRESS, ABI,
    OWNER_PRIVATE_KEY, STORAGE_MODELS,
    GLOBAL_MODEL_PATH
} = require("./config");

const { loadWeights, saveWeights, fedAvg, hashFile } = require("./utils");

const web3 = new Web3(RPC_URL);
const owner = web3.eth.accounts.privateKeyToAccount(OWNER_PRIVATE_KEY);
web3.eth.accounts.wallet.add(owner);

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

let ROUND = 1;

async function startRound() {
    console.log(`\n🚀 Starting Round ${ROUND} ...`);

    const hash = hashFile(GLOBAL_MODEL_PATH);

    await contract.methods.startRound(
        ROUND,
        GLOBAL_MODEL_PATH,
        hash
    ).send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} started`);
}

async function aggregateRound() {
    const count = await contract.methods.getUpdateCount(ROUND).call();

    if (count == 0) {
        console.log(`[ORCH] Round ${ROUND}: No updates received`);
        return;
    }

    console.log(`[ORCH] Aggregating ${count} updates...`);

    let weightSets = [];
    let sizes = [];

    for (let i = 0; i < count; i++) {
        const [, uri, , size] =
            await contract.methods.getUpdate(ROUND, i).call();

        const weights = loadWeights(`${uri}/weights.json`);

        weightSets.push(weights);
        sizes.push(parseInt(size));
    }

    const averaged = fedAvg(weightSets, sizes);

    const outFolder = path.join(STORAGE_MODELS, `round_${ROUND}_agg`);
    fs.mkdirSync(outFolder, { recursive: true });

    saveWeights(averaged, `${outFolder}/weights.json`);
    const newHash = hashFile(`${outFolder}/weights.json`);

    await contract.methods.closeRound(ROUND).send({ from: owner.address });
    await contract.methods.storeAggregated(ROUND, outFolder, newHash)
        .send({ from: owner.address });

    console.log(`[ORCH] Round ${ROUND} aggregation complete`);

    // overwrite global model for next round
    fs.copyFileSync(`${outFolder}/weights.json`, GLOBAL_MODEL_PATH);

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
