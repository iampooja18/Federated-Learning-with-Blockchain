import React, { useState } from "react";
import toast from "react-hot-toast";

const PREDICT_API = import.meta.env.VITE_PREDICT_API; // http://localhost:6000
const FL_API = import.meta.env.VITE_FL_API;           // http://localhost:5000

export default function UploadPredict() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = (e) => {
    const f = e.target.files[0];
    setFile(f || null);
    setResult(null);
    if (f) setPreview(URL.createObjectURL(f));
  };

  // 🔥 FIXED: SEND RAW BYTES (NOT FormData)
  const handlePredict = async () => {
    if (!file) return toast.error("Select an image first");

    setResult(null);        // ✅ ADD THIS LINE
    setPredicting(true); // ✅ ALWAYS CLEAR OLD RESULT FIRST

    try {
      const arrayBuffer = await file.arrayBuffer();

      const res = await fetch(`${PREDICT_API}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: arrayBuffer
      });

      const data = await res.json();

      // ✅ HANDLE HUMAN / ERROR RESPONSE
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || "Prediction failed");

      }

      setResult(data);
      toast.success("Prediction & local training done!");
    } catch (err) {
      setResult(null); // ✅ ENSURE RESULT IS CLEARED
      toast.error(err.message);
    } finally {
      setPredicting(false);
    }
  };



  const handleSubmitUpdate = async () => {
    if (!result?.weightsPath) return toast.error("No update generated");

    setSending(true);
    try {
      const res = await fetch(`${FL_API}/submit-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "frontend_client",
          weightsPath: result.weightsPath,
          weightsHash: result.weightsHash,
          weightsSize: result.weightsSize,
          round: 1
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      toast.success(`Update submitted (Round ${data.round})`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>🐶 Cat vs Dog Classifier</h2>

      {preview && (
        <div style={styles.previewContainer}>
          <img src={preview} alt="Uploaded" style={styles.previewImg} />
        </div>
      )}

      <label style={styles.uploadBtn}>
        <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        📤 Choose Image
      </label>

      <button
        disabled={!file || predicting}
        onClick={handlePredict}
        style={{
          ...styles.actionBtn,
          background: predicting ? "#6b7280" : "#2563eb"
        }}
      >
        {predicting ? "⏳ Working…" : "🔍 Predict & Train"}
      </button>

      <button
        disabled={!result?.weightsPath || sending}
        onClick={handleSubmitUpdate}
        style={{
          ...styles.actionBtn,
          background: sending ? "#6b7280" : "#059669"
        }}
      >
        {sending ? "⏳ Submitting..." : "🚀 Send to Global FL"}
      </button>

      {result?.success && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📊 Prediction Result</h3>
          <p><strong>Label:</strong> {result.label}</p>
          <p><strong>Confidence:</strong> {(result.score * 100).toFixed(2)}%</p>
          <p style={styles.pathText}>
            <strong>Weights File:</strong> {result.weightsPath}
          </p>
        </div>
      )}

    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    maxWidth: "450px",
    margin: "auto",
    padding: "20px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
    textAlign: "center"
  },
  heading: {
    fontSize: "24px",
    fontWeight: "700",
    marginBottom: "20px"
  },
  previewContainer: {
    marginBottom: "20px"
  },
  previewImg: {
    width: "50%",
    borderRadius: "12px"
  },
  uploadBtn: {
    display: "inline-block",
    padding: "10px 18px",
    background: "#4f46e5",
    color: "#fff",
    borderRadius: "10px",
    cursor: "pointer",
    marginBottom: "15px"
  },
  actionBtn: {
    width: "100%",
    padding: "12px",
    margin: "8px 0",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    cursor: "pointer"
  },
  card: {
    marginTop: "20px",
    padding: "15px",
    borderRadius: "12px",
    background: "#f3f4f6",
    textAlign: "left"
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "10px"
  },
  pathText: {
    wordBreak: "break-all",
    overflowWrap: "anywhere",
    whiteSpace: "normal"
  }
};
