const fs = require("fs");
const crypto = require("crypto");

module.exports = {
  loadWeights(path) {
    return JSON.parse(fs.readFileSync(path, "utf8")).weights;
  },

  saveWeights(weights, outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ weights }));
  },

  hashFile(filePath) {
    return crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");
  },

  fedAvg(weightSets, sizes) {
    const total = sizes.reduce((a, b) => a + b, 0);
    const avg = new Array(weightSets[0].length).fill(0);

    weightSets.forEach((weights, idx) => {
      const factor = sizes[idx] / total;
      weights.forEach((val, j) => {
        avg[j] += val * factor;
      });
    });

    return avg;
  }
};
