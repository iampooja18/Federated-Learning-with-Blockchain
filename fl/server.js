const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// FIX: Increase JSON payload size limit
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.post("/submit", (req, res) => {
    const { weights, hash } = req.body;

    if (!weights || !hash) {
        return res.status(400).send("Invalid payload");
    }

    const outDir = path.join(__dirname, "../storage/updates/client_py");
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(path.join(outDir, "weights.json"), JSON.stringify(weights));
    fs.writeFileSync(path.join(outDir, "hash.txt"), hash);

    res.send("Update stored successfully");
});

app.listen(5000, () => {
    console.log("Python-client server running on port 5000");
});
