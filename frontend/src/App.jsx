import React from "react";
import UploadPredict from "./UploadPredict";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white p-6 rounded-lg shadow">
        <UploadPredict />
      </div>
    </div>
  );
}
