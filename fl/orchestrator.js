const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { Web3 } = require("web3");

const {
  RPC_URL,
  CONTRACT_ADDRESS,
  ABI,
  OWNER_PRIVATE_KEY,
  STORAGE_MODELS,
  GLOBAL_MODEL_PATH,
  STORAGE_UPDATES
} = require("./config");

const { hashFile } = require("./utils");

const web3 = new Web3(RPC_URL);
const owner = web3.eth.accounts.privateKeyToAccount(OWNER_PRIVATE_KEY);
web3.eth.accounts.wallet.add(owner);

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

// ------------------------------------------------
// Ensure folders
// ------------------------------------------------
fs.mkdirSync(path.dirname(GLOBAL_MODEL_PATH), { recursive: true });
fs.mkdirSync(STORAGE_MODELS, { recursive: true });

// ------------------------------------------------
// CREATE INITIAL GLOBAL MODEL (ROUND 0)
// ------------------------------------------------
function createInitialGlobalModel() {
  if (fs.existsSync(GLOBAL_MODEL_PATH)) return;

  console.log("🧠 Creating initial global model (Round 0)");

  const python = "python";
  const script = `
import tensorflow as tf, os
os.makedirs(os.path.dirname("${GLOBAL_MODEL_PATH}"), exist_ok=True)

model = tf.keras.Sequential([
  tf.keras.layers.Input(shape=(160,160,3)),
  tf.keras.layers.Flatten(),
  tf.keras.layers.Dense(8, activation="relu"),
  tf.keras.layers.Dense(1, activation="sigmoid")
])

model.compile(optimizer="adam", loss="binary_crossentropy")
model.save("${GLOBAL_MODEL_PATH}", include_optimizer=False)
print("INITIAL GLOBAL MODEL CREATED")
`;
  spawnSync(python, ["-c", script], { stdio: "inherit" });
}

// ------------------------------------------------
// MAIN LOOP
// ------------------------------------------------
async function loop() {
  let round = Number(await contract.methods.currentRound().call());

  // 🔥 Start round if blockchain round == 0
  if (round === 0) {
    const hash = hashFile(GLOBAL_MODEL_PATH);
    await contract.methods
      .startRound(1, GLOBAL_MODEL_PATH, hash)
      .send({ from: owner.address });
    round = 1;
    console.log("🚀 Blockchain Round 1 started");
  }

  console.log(`[ORCH] Active Round: ${round}`);

  const count = await contract.methods.getUpdateCount(round).call();
  if (Number(count) === 0) {
    console.log(`[ORCH] Round ${round}: No updates yet`);
    setTimeout(loop, 8000);
    return;
  }

  // Aggregate
  const outFolder = path.join(STORAGE_MODELS, `round_${round}_agg`);
  fs.mkdirSync(outFolder, { recursive: true });
  const outPath = path.join(outFolder, "model_agg.h5");

  const args = [
    path.resolve(__dirname, "aggregate_h5.py"),
    outPath,
    GLOBAL_MODEL_PATH
  ];

  for (let i = 0; i < count; i++) {
    const u = await contract.methods.getUpdate(round, i).call();
    args.push(u[1], String(u[3]));
  }

  spawnSync("python", args, { stdio: "inherit" });

  const aggHash = hashFile(outPath);
  await contract.methods.closeRound(round).send({ from: owner.address });
  await contract.methods.storeAggregated(round, outFolder, aggHash)
    .send({ from: owner.address });

  fs.copyFileSync(outPath, GLOBAL_MODEL_PATH);
  console.log(`✅ Round ${round} complete`);

  // ------------------------------------------------
  // 🔄 Increment round and start next automatically
  // ------------------------------------------------
  const nextRound = round + 1;
  const nextHash = hashFile(GLOBAL_MODEL_PATH);

  await contract.methods
    .startRound(nextRound, GLOBAL_MODEL_PATH, nextHash)
    .send({ from: owner.address });

  console.log(`🚀 Blockchain Round ${nextRound} started`);
  setTimeout(loop, 8000);
}

// ------------------------------------------------
(async () => {
  createInitialGlobalModel();
  loop();
})();
