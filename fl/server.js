// fl/server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const crypto = require("crypto");
const { Web3 } = require("web3");

// ================================================================
// APP SETUP
// ================================================================
const app = express();
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "50mb" }));

// ================================================================
// LOAD CONFIG (BLOCKCHAIN = SOURCE OF TRUTH)
// ================================================================
const {
  RPC_URL,
  CONTRACT_ADDRESS,
  ABI,
  OWNER_PRIVATE_KEY
} = require("./config");

// ================================================================
// WEB3 SETUP (SINGLE BLOCKCHAIN INTERFACE — KEEP IT SIMPLE)
// ================================================================
const web3 = new Web3(RPC_URL);
web3.eth.accounts.wallet.add(OWNER_PRIVATE_KEY);

const wallet = web3.eth.accounts.wallet;
const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

// ================================================================
// IN-MEMORY UPDATE TRACKING
// { round: [ { clientId, hash, path, size } ] }
// ================================================================
const updatesByRound = {};

// ================================================================
// GET CURRENT ROUND (BLOCKCHAIN = SOURCE OF TRUTH)
// ================================================================
app.get("/current-round", async (req, res) => {
  try {
    const round = Number(await contract.methods.currentRound().call());
    const info = await contract.methods.rounds(round).call();

    res.json({
      round,
      global_model_hash: info.globalModelHash
    });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});


// ================================================================
// IMAGE PREDICTION (INFERENCE FLOW — NOT PART OF FL)
// ================================================================
const upload = multer({
  dest: path.join(__dirname, "../storage/uploads/")
});

app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image required"
      });
    }

    const imgBytes = fs.readFileSync(req.file.path);

    const pyRes = await axios.post(
      "http://127.0.0.1:7000/predict",
      imgBytes,
      { headers: { "Content-Type": "application/octet-stream" } }
    );

    res.json(pyRes.data);

  } catch (err) {
    console.error("PYTHON ERROR:", err.response?.data || err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ================================================================
// SUBMIT MODEL UPDATE (FEDERATED LEARNING — PAPER CORE)
// ================================================================
app.post("/submit-update", async (req, res) => {
  try {
    const {
      clientId,
      weightsPath,
      weightsHash,
      weightsSize,
      round
    } = req.body;

    if (!clientId || !weightsPath || !weightsHash) {
      return res.status(400).json({
        success: false,
        message: "Missing update metadata"
      });
    }

    // ================================================================
    // 1️⃣ ROUND RESOLUTION (BLOCKCHAIN DECIDES)
// ================================================================
    const chainRound = await contract.methods.currentRound().call();
    const usingRound = Number(round ?? chainRound);

    console.log("\n📥 FL UPDATE RECEIVED");
    console.log(" Client:", clientId);
    console.log(" Round :", usingRound);
    console.log(" Hash  :", weightsHash);

    // ================================================================
    // 2️⃣ CHECK ROUND STATE ON-CHAIN
// ================================================================
    const roundInfo = await contract.methods.rounds(usingRound).call();

    if (!roundInfo.collecting) {
      return res.status(400).json({
        success: false,
        round: usingRound,
        message: "Round closed — update rejected"
      });
    }

    // ================================================================
    // 3️⃣ OFF-CHAIN UPDATE TRACKING (MULTI-CLIENT SAFE)
// ================================================================
    if (!updatesByRound[usingRound]) {
      updatesByRound[usingRound] = [];
    }

    const duplicate = updatesByRound[usingRound]
      .some(u => u.clientId === clientId);

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Client already submitted for this round"
      });
    }

    updatesByRound[usingRound].push({
      clientId,
      hash: weightsHash,
      path: weightsPath,
      size: weightsSize
    });

    // ================================================================
    // 4️⃣ BLOCKCHAIN VERIFICATION (HASH ONLY — PAPER COMPLIANT)
// ================================================================
    const from = wallet[0].address;

    let gas;
    try {
      gas = await contract.methods
        .submitUpdate(
          usingRound,
          weightsPath,
          weightsHash,
          weightsSize
        )
        .estimateGas({ from });

      gas = Math.floor(gas * 1.25);
    } catch {
      gas = 500_000;
    }

    const tx = await contract.methods
      .submitUpdate(
        usingRound,
        weightsPath,
        weightsHash,
        weightsSize
      )
      .send({ from, gas });

    console.log("✅ Blockchain update recorded:", tx.transactionHash);

    // ================================================================
    // 5️⃣ RESPONSE (CLIENT NEEDS ROUND NUMBER)
// ================================================================
    return res.json({
      success: true,
      round: usingRound,
      txHash: tx.transactionHash,
      totalUpdatesThisRound: updatesByRound[usingRound].length
    });

  } catch (err) {
    console.error("❌ Submit update error:", err);
    return res.status(500).json({
      success: false,
      error: err.toString()
    });
  }
});

// ================================================================
// START SERVER
// ================================================================
app.listen(5000, () => {
  console.log("🚀 Node API running at http://127.0.0.1:5000");
});
