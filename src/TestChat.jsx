import React, { useState } from "react";

export default function ChatPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Chat Popup */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "90px",
            right: "20px",
            width: "350px",
            height: "500px",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            overflow: "hidden",
            zIndex: 9999
          }}
        >
          <div
            style={{
              padding: "12px",
              background: "#0176d3",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>Chat with Agent</span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "18px"
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: "16px" }}>
            <p>Welcome! How can we help you?</p>
          </div>
        </div>
      )}

      {/* Floating Chat Icon */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          border: "none",
          background: "#0176d3",
          color: "#fff",
          fontSize: "28px",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          zIndex: 10000
        }}
      >
        💬
      </button>
    </>
  );
}