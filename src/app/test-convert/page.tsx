"use client";

import { UploadZone } from "@/components/UploadZone";

export default function TestConvertPage() {
  return (
    <div style={{ padding: "24px", maxWidth: "700px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Test Conversion Page</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        This page bypasses auth for testing the conversion flow.
      </p>
      <UploadZone bypassAuth={true} />
    </div>
  );
}