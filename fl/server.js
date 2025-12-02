// fl/server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Web3 } = require("web3");

const app = express();
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "50mb" }));

// NOTE: this file is inside fl/, so require ./config
const { RPC_URL, CONTRACT_ADDRESS, ABI, CLIENT_PRIVATE_KEY, OWNER_PRIVATE_KEY } = require("./config");

// Setup web3 & contract
const web3 = new Web3(RPC_URL);

// Add keys to wallet (if already added, web3 will ignore duplicates)
try {
  if (CLIENT_PRIVATE_KEY) web3.eth.accounts.wallet.add(CLIENT_PRIVATE_KEY);
  if (OWNER_PRIVATE_KEY) web3.eth.accounts.wallet.add(OWNER_PRIVATE_KEY);
} catch (e) {
  // ignore if already present
}

const walletAccounts = web3.eth.accounts.wallet;
if (walletAccounts.length === 0) {
  console.warn("[NODE] No accounts in wallet. Make sure CLIENT_PRIVATE_KEY or OWNER_PRIVATE_KEY is set in fl/config.js");
}

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
const ROUND = 1; // static default; change if you pass round in request

// ------------------------
// 1) Predict proxy (Frontend → Node → Python)
// ------------------------
const multer = require("multer");
const upload = multer({ dest: path.join(__dirname, "../storage/uploads/") });

app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: "Image required" });

    // Read image bytes
    const imageBytes = fs.readFileSync(req.file.path);

    // Send to Python server as raw bytes
    const axios = require("axios");
    const pyRes = await axios.post("http://127.0.0.1:6000/predict", imageBytes, {
      headers: { "Content-Type": "application/octet-stream" }
    });

    return res.json(pyRes.data);

  } catch (err) {
    console.error("PYTHON ERROR:", err.response?.data || err);
    res.status(500).json({ success: false, message: "Prediction failed", error: err.toString() });
  }
});

// ------------------------
// 2) Submit FL update (Python client → Node → Blockchain)
// ------------------------
app.post("/submit-update", async (req, res) => {
  try {
    const { weightsPath, weightsHash, weightsSize, round } = req.body;

    if (!weightsPath || !weightsHash)
      return res.status(400).json({ success: false, message: "Invalid update" });

    const usingRound = round !== undefined ? round : ROUND;

    console.log("\nReceived FL update:");
    console.log("Path:", weightsPath);
    console.log("Hash:", weightsHash);
    console.log("Size:", weightsSize);
    console.log("Round:", usingRound);

    // Use first wallet account as sender (prefer client key if present)
    if (!web3.eth.accounts.wallet.length) {
      return res.status(500).json({ success: false, message: "No wallet accounts available to send transaction" });
    }
    const from = web3.eth.accounts.wallet[0].address;

    // Convert numeric inputs to strings to avoid BigInt mixing errors with web3 v4
    const roundStr = String(usingRound);
    const sizeStr = String(weightsSize);

    // Safely estimate gas, fallback to a default
    let gas;
    try {
      gas = await contract.methods
        .submitUpdate(roundStr, weightsPath, weightsHash, sizeStr)
        .estimateGas({ from });
      // add modest cushion
      gas = Math.floor(gas * 1.25);
    } catch (err) {
      console.warn("[NODE] estimateGas failed, using fallback gas:", err.toString());
      gas = 500_000; // fallback gas limit
    }

    // Send tx
    const tx = await contract.methods
      .submitUpdate(roundStr, weightsPath, weightsHash, sizeStr)
      .send({ from, gas });

    console.log("[NODE] Update submitted on-chain:", tx.transactionHash);

    return res.json({ success: true, message: "Update saved", txHash: tx.transactionHash });

  } catch (err) {
    console.error("Error submitting update to blockchain:", err);
    res.status(500).json({ success: false, message: "Failed to submit update", error: err.toString() });
  }
});

app.listen(5000, () =>
  console.log("Node API running at http://127.0.0.1:5000")
);
