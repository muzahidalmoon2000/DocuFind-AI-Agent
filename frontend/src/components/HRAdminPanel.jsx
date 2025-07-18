import React, { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";

export default function HRAdminPanel() {
  const [docs, setDocs] = useState([]);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState(null);
  const [uploading, setUploading] = useState(false);

  const allowedAdmins = ["suzon@ba3digitalmarketing.com"];

  // 🔐 Fetch logged-in user
  useEffect(() => {
    fetch("/check_login", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setUserEmail(data.user_email || ""));
  }, []);

  // 📂 Load indexed documents
  const fetchDocs = useCallback(() => {
    fetch("/api/hr_documents", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setDocs(data.files || []))
      .catch(() => setDocs([]));
  }, []);

  useEffect(() => {
    if (userEmail) fetchDocs();
  }, [userEmail, fetchDocs]);

  // 📤 Handle file drop
  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const res = await fetch("/upload_hr_doc", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      setMessage(data.message || data.error || "Upload failed.");
      setUploading(false);
      fetchDocs();
    } catch (err) {
      console.error("Upload failed:", err);
      setMessage("❌ Upload failed.");
      setUploading(false);
    }
  };

  // ❌ Handle file deletion
  const handleDelete = async (filename) => {
    const confirmed = window.confirm(`Delete "${filename}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch("/api/hr_documents", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });

      const data = await res.json();
      setMessage(data.message || data.error || "Delete failed.");
      fetchDocs();
    } catch (err) {
      console.error("Delete failed:", err);
      setMessage("❌ Delete failed.");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
      "text/plain": [],
    },
    multiple: false,
  });

  const getFileIcon = (name) => {
    if (name.endsWith(".pdf")) return "📕";
    if (name.endsWith(".docx")) return "📘";
    if (name.endsWith(".txt")) return "📄";
    return "📁";
  };

  if (userEmail && !allowedAdmins.includes(userEmail.toLowerCase())) {
    return (
      <div className="p-6 text-center text-red-600">
        🚫 You are not authorized to access this page.
      </div>
    );
  }

  return (
    <div className="min-h-screen w-[100%] bg-gray-50 p-10">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-md shadow">
        <h1 className="text-2xl text-black font-semibold mb-6">📂 HR Knowledge Base</h1>

        {/* 🚀 Dropzone Upload */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-md p-8 text-center mb-6 cursor-pointer transition ${
            isDragActive ? "border-purple-600 bg-purple-50" : "border-purple-400"
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-sm text-gray-500 mb-2">
            {isDragActive
              ? "📥 Drop the file here..."
              : "Click or drag a PDF, DOCX, or TXT file to upload."}
          </p>
          <button
            type="button"
            disabled={uploading}
            className="bg-[#BD945B] hover:bg-[#d4a665] disabled:opacity-50 text-black px-4 py-2 rounded"
          >
            {uploading ? "Uploading..." : "Select File"}
          </button>
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
        </div>

        {/* 📊 Document Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-sm">
              <tr>
                <th className="p-3 text-left text-black font-medium">📄 File</th>
                <th className="p-3 text-left text-black font-medium">📦 Size (KB)</th>
                <th className="p-3 text-left text-black font-medium">📅 Indexed</th>
                <th className="p-3 text-left text-black font-medium">👤 Uploaded By</th>
                <th className="p-3 text-right text-black font-medium">🗑️ Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.length > 0 ? (
                docs.map((doc, i) => (
                  <tr key={i} className="border-t text-black text-sm hover:bg-gray-50">
                    <td className="p-3">{getFileIcon(doc.name)} {doc.name}</td>
                    <td className="p-3">{doc.size_kb}</td>
                    <td className="p-3">{doc.updated}</td>
                    <td className="p-3">{doc.uploader || "-"}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(doc.name)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-gray-500 italic">
                    No indexed documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
