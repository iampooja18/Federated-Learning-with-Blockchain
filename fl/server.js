// fl/server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const { Web3 } = require("web3");

const app = express();
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "50mb" }));

// Load config
const { RPC_URL, CONTRACT_ADDRESS, ABI, CLIENT_PRIVATE_KEY, OWNER_PRIVATE_KEY } = require("./config");

// Setup web3
const web3 = new Web3(RPC_URL);

// Load private keys
try {
  if (CLIENT_PRIVATE_KEY) web3.eth.accounts.wallet.add(CLIENT_PRIVATE_KEY);
  if (OWNER_PRIVATE_KEY) web3.eth.accounts.wallet.add(OWNER_PRIVATE_KEY);
} catch (e) {}

const wallet = web3.eth.accounts.wallet;
const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

// ================================================================
//   🔥 GET CURRENT ROUND
// ================================================================
app.get("/current-round", async (req, res) => {
  try {
    const round = await contract.methods.currentRound().call();
    res.json({ round: Number(round) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ================================================================
//   🔥 PREDICT (Image → Python Server)
// ================================================================
const upload = multer({ dest: path.join(__dirname, "../storage/uploads/") });

app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: "Image required" });

    const imgBytes = fs.readFileSync(req.file.path);

    const pyRes = await axios.post("http://127.0.0.1:6000/predict", imgBytes, {
      headers: { "Content-Type": "application/octet-stream" }
    });

    res.json(pyRes.data);

  } catch (err) {
    console.error("PYTHON ERROR:", err.response?.data || err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ================================================================
//   🔥 SUBMIT UPDATE TO BLOCKCHAIN  (FINAL FIXED VERSION)
// ================================================================
app.post("/submit-update", async (req, res) => {
  try {
    const { weightsPath, weightsHash, weightsSize, round } = req.body;

    if (!weightsPath || !weightsHash) {
      return res.status(400).json({
        success: false,
        message: "Invalid update metadata"
      });
    }

    // 1️⃣ CURRENT ROUND FROM BLOCKCHAIN
    const currentRound = await contract.methods.currentRound().call();
    const usingRound = round ?? currentRound;

    console.log("\n📥 New FL Update Received");
    console.log("  Path:", weightsPath);
    console.log("  Hash:", weightsHash);
    console.log("  Size:", weightsSize);
    console.log("  Round:", usingRound);

    const from = wallet[0].address;

    const roundBig = BigInt(usingRound);
    const sizeBig = BigInt(weightsSize);

    // ================================================================
    //  ✔ ROUND STATE CHECK
    // ================================================================
    const roundInfo = await contract.methods.rounds(roundBig).call();

    if (!roundInfo.collecting) {
      console.log("⚠ Update rejected: Round already closed:", usingRound);
      return res.status(400).json({
        success: false,
        round: usingRound,   // ← ADDED
        message: "Round is already closed — update ignored"
      });
    }

    // ================================================================
    // 2️⃣ ESTIMATE GAS
    // ================================================================
    let gas;
    try {
      gas = await contract.methods
        .submitUpdate(roundBig, weightsPath, weightsHash, sizeBig)
        .estimateGas({ from });

      gas = Math.floor(gas * 1.25);
    } catch (err) {
      console.warn("⚠ Gas estimation error:", err.toString());
      gas = 500_000;
    }

    // ================================================================
    // 3️⃣ SUBMIT UPDATE ON-CHAIN
    // ================================================================
    const tx = await contract.methods
      .submitUpdate(roundBig, weightsPath, weightsHash, sizeBig)
      .send({ from, gas });

    console.log("✅ Update submitted on-chain:", tx.transactionHash);

    // ================================================================
    // 👉 CRITICAL FIX: RETURN round so python_client.py does NOT CRASH
    // ================================================================
    return res.json({
      success: true,
      txHash: tx.transactionHash,
      round: usingRound      // ← **MOST IMPORTANT FIX**
    });

  } catch (err) {
    console.error("❌ Error submitting update:", err);

    return res.status(500).json({
      success: false,
      round: null,
      error: err.toString()
    });
  }
});


// ================================================================
//   START SERVER
// ================================================================
app.listen(5000, () =>
  console.log("🚀 Node API running at http://127.0.0.1:5000")
);