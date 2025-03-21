import React, { useState, useEffect, useRef } from "react";

const WEBSOCKET_URL = "<API_URL>";

const App = () => {
    const [docId] = useState("doc123");
    const [content, setContent] = useState("");
    const textAreaRef = useRef(null);
    const socketRef = useRef(null);
    const contentRef = useRef(""); // Track latest content safely
    const cursorPositionRef = useRef(0); // Track cursor position
    const lastSentText = useRef(""); // Store last sent text
    const pendingChanges = useRef([]); // Buffer updates
    const buffer = useRef(""); // Buffer for word batching
    const isRemoteUpdate = useRef(false); // ✅ NEW: Prevent re-sending updates from WebSocket

    useEffect(() => {
        // Open WebSocket connection
        socketRef.current = new WebSocket(WEBSOCKET_URL);

        socketRef.current.onopen = () => {
            console.log("WebSocket connected");
        };

        socketRef.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log("Received update:", message);

            if (message.docId === docId) {
                const updatedContent = applyOperationalTransformation(message.changes);

                if (updatedContent !== contentRef.current) {
                    isRemoteUpdate.current = true; // ✅ Mark as a remote update
                    contentRef.current = updatedContent;
                    setContent(updatedContent);
                }
            }
        };

        socketRef.current.onclose = () => {
            console.log("WebSocket disconnected");
        };

        return () => {
            socketRef.current.close();
        };
    }, [docId]);

    // 🛠 Apply Operational Transformation (OT)
    const applyOperationalTransformation = (changes) => {
        let newContent = contentRef.current.split("");

        changes.forEach(({ type, position, text }) => {
            if (type === "insert") {
                newContent.splice(position, 0, ...text.split(""));
            } else if (type === "delete") {
                newContent.splice(position, text.length);
            }
        });

        return newContent.join("");
    };

    const sendUpdate = () => {
        if (pendingChanges.current.length === 0) return;

        const updateMessage = {
            action: "MESSAGE",
            docId,
            changes: pendingChanges.current,
        };

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            console.log("Sending WebSocket message:", updateMessage);
            socketRef.current.send(JSON.stringify(updateMessage));
            pendingChanges.current = []; // Clear the buffer after sending
            lastSentText.current = contentRef.current; // Update last sent text
        } else {
            console.warn("WebSocket not ready, retrying in 100ms...");
            setTimeout(sendUpdate, 100);
        }
    };

    const handleEdit = (e) => {
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return; // Ignore remote updates
        }
    
        const newText = e.target.value;
        const oldText = contentRef.current;
        const selectionStart = textAreaRef.current.selectionStart;
    
        cursorPositionRef.current = selectionStart; // Save cursor position
        setContent(newText);
        contentRef.current = newText; // Update reference for tracking
    
        if (newText.length > oldText.length) {
            // Text inserted
            const insertedText = newText.substring(selectionStart - 1, selectionStart);
            buffer.current += insertedText;
    
            if ([" ", ".", ",", "!", "?"].includes(insertedText)) {
                if (buffer.current.trim() !== "") {
                    pendingChanges.current.push({
                        type: "insert",
                        position: selectionStart - buffer.current.length,
                        text: buffer.current,
                    });
                    buffer.current = ""; // Clear buffer after sending
                }
            }
        } else if (newText.length < oldText.length) {
            // Text deleted
            const diffIndex = [...oldText].findIndex((char, i) => char !== (newText[i] || ""));
            if (diffIndex !== -1) {
                const deletedText = oldText.substring(diffIndex, oldText.length - newText.length + diffIndex);
                pendingChanges.current.push({
                    type: "delete",
                    position: diffIndex,
                    text: deletedText,
                });
            }
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            sendUpdate();
        }, 7000); // Send updates every 7 seconds

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: "20px" }}>
            <h2>Collaborative Document Editor</h2>
            <textarea
                ref={textAreaRef}
                value={content}
                onChange={handleEdit}
                rows="10"
                cols="50"
                style={{ width: "100%", height: "300px" }}
            />
        </div>
    );
};

export default App;
