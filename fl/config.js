const path = require("path");
const fs = require("fs");

// ======================================================
// LOAD ABI FROM HARDHAT ARTIFACTS
// ======================================================
const ABI = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../blockchain/artifacts/contracts/FederatedLearning.sol/FederatedLearning.json"
    ),
    "utf8"
  )
).abi;

// ======================================================
// EXPORT CONFIG
// ======================================================
module.exports = {
  // Local Hardhat RPC
  RPC_URL: "http://127.0.0.1:8545",

  // 🔴 PUT YOUR DEPLOYED CONTRACT ADDRESS HERE
  CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",

  ABI,

  // ======================================================
  // ✅ SINGLE SOURCE OF TRUTH FOR GLOBAL MODEL
  // ======================================================
  // This MUST match python_client.py and orchestrator.js
  GLOBAL_MODEL_PATH: path.join(
    __dirname,
    "../storage/models/global_fed_model.h5"
  ),

  // ======================================================
  // STORAGE PATHS
  // ======================================================
  STORAGE_MODELS: path.join(__dirname, "../storage/models"),
  STORAGE_UPDATES: path.join(__dirname, "../storage/updates"),

  // ======================================================
  // HARDHAT ACCOUNTS
  // ======================================================
  // Account[0] → Orchestrator / Owner
  OWNER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",

  // Account[1] → Client
  CLIENT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
};
