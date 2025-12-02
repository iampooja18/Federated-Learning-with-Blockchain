const path = require("path");
const fs = require("fs");

// Load ABI from Hardhat artifacts
const ABI = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../blockchain/artifacts/contracts/FederatedLearning.sol/FederatedLearning.json"
    ),
    "utf8"
  )
).abi;

module.exports = {
  RPC_URL: "http://127.0.0.1:8545",

  // ✅ Inserted your deployed Hardhat contract address:
  CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",

  ABI,

  // Path to global weights file (JSON version)
  GLOBAL_MODEL_PATH: path.join(
    __dirname,
    "../storage/global_model/weights.json"
  ),

  STORAGE_MODELS: path.join(__dirname, "../storage/models"),
  STORAGE_UPDATES: path.join(__dirname, "../storage/updates"),

  // Hardhat Account 0 (owner)
  OWNER_PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",

  // Hardhat Account 1 (client)
  CLIENT_PRIVATE_KEY:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    
};
