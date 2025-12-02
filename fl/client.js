const fs = require("fs");
const path = require("path");
const { Web3 } = require("web3");
const tf = require("@tensorflow/tfjs");

const {
    RPC_URL, CONTRACT_ADDRESS, ABI,
    CLIENT_PRIVATE_KEY, STORAGE_UPDATES, GLOBAL_MODEL_PATH
} = require("./config");

const { loadWeights, saveWeights, hashFile } = require("./utils");

const web3 = new Web3(RPC_URL);
const client = web3.eth.accounts.privateKeyToAccount(CLIENT_PRIVATE_KEY);
web3.eth.accounts.wallet.add(client);

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
const ROUND = 1;

/* -------------------------
   Load TFJS Model
-------------------------- */
async function loadModel() {
    return await tf.loadLayersModel("file://model.json");
}

/* -------------------------
   Set weights into TFJS model
-------------------------- */
function setModelWeights(model, flatWeights) {
    let idx = 0;

    const shapes = model.getWeights().map(w => w.shape);
    const newWeights = shapes.map(shape => {
        const size = shape.reduce((a, b) => a * b, 1);
        const arr = flatWeights.slice(idx, idx + size);
        idx += size;
        return tf.tensor(arr, shape);
    });

    model.setWeights(newWeights);
}

/* -------------------------
   Extract weights from model (flattened)
-------------------------- */
function extractFlatWeights(model) {
    const tensors = model.getWeights();
    let flat = [];
    tensors.forEach(t => {
        flat = flat.concat(Array.from(t.dataSync()));
    });
    return flat;
}

/* -------------------------
   Local Training Simulation
-------------------------- */
async function localTrain(model) {
    const dummyX = tf.randomNormal([8, 224, 224, 3]);
    const dummyY = tf.oneHot(tf.tensor1d([1, 0, 1, 1, 0, 1, 0, 0], "int32"), 2);

    model.compile({
        optimizer: "adam",
        loss: "categoricalCrossentropy"
    });

    await model.fit(dummyX, dummyY, { epochs: 1, verbose: 0 });
}

/* -------------------------
   Continuous Client Loop
-------------------------- */
async function clientLoop() {
    while (true) {
        console.log("\n--- 🔄 CLIENT LOOP STARTED ---");

        const roundInfo = await contract.methods.rounds(ROUND).call();
        const globalPath = roundInfo.globalModelUri;

        const globalWeights = loadWeights(globalPath);

        const model = await loadModel();
        setModelWeights(model, globalWeights);

        console.log("[CLIENT] Training locally...");
        await localTrain(model);

        const updated = extractFlatWeights(model);

        const out = path.join(STORAGE_UPDATES, client.address.slice(2, 8));
        fs.mkdirSync(out, { recursive: true });

        saveWeights(updated, `${out}/weights.json`);
        const h = hashFile(`${out}/weights.json`);

        await contract.methods
            .submitUpdate(ROUND, out, h, updated.length)
            .send({ from: client.address });

        console.log("[CLIENT] Update submitted. Waiting 10s for next cycle...");

        await new Promise(r => setTimeout(r, 10000));
    }
}

clientLoop();
