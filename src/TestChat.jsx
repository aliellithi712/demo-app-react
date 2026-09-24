import React, { useState, useEffect } from 'react';
import { Paperclip, Send, X, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export default function ChatComponent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);

  const isDisabled = isLoading || attachments.length > 0;

  const handleFileChange = (e) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const startSession = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_BACKEND_ENDPOINT}/api/agentforce/start-session`, { method: 'POST' });
        const data = await response.json();
        setSessionId(data.data.sessionId);
        
        setMessages([
          {
            id: 1,
            sender: 'bot',
            text: data.message || 'Hello! How can I help you today?',
            attachments: []
          }
        ]);
      } catch (error) {
        console.error('Error starting session:', error);
        setMessages([
          {
            id: 1,
            sender: 'bot',
            text: 'Hello! How can I help you today?',
            attachments: []
          }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    startSession();
  }, []);

  useEffect(() => {
    const messagesArea = document.querySelector('[style*="overflowY"]');
    if (messagesArea) {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: input,
      attachments: attachments.map(file => ({ name: file.name, type: file.type }))
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    try {
      let botResponseText = '';

      if (currentAttachments.length > 0) {
        // api/agentforce/attachment
        const convertFileToBase64 = (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
          });
        };

        const attachmentsPayload = await Promise.all(
          currentAttachments.map(async (file) => ({
            name: file.name,
            type: file.type,
            data: await convertFileToBase64(file)
          }))
        );

        const attachmentResponse = await fetch(`${import.meta.env.VITE_BACKEND_ENDPOINT}/api/agentforce/attachment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: currentInput, attachments: attachmentsPayload })
        });

        console.log('Attachment response:', attachmentResponse);

      botResponseText = attachmentResponse.data || 'TEST';
      

        

        
      } else {
        // Standard backend call when no attachments
        const response = await fetch(`${import.meta.env.VITE_BACKEND_ENDPOINT}/api/agentforce/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: currentInput,
            sessionId
          })
        });
        const botResponse = await response.json();
        botResponseText = botResponse.data || botResponse.answer || 'Response received.';
      }

      const botMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: botResponseText,
        attachments: []
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error handling send:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Bot size={20} color="#fff" />
        </div>
        <div>
          <h3 style={styles.headerTitle}>AI Assistant</h3>
          <span style={styles.headerSubtitle}>
            <span style={styles.onlineDot}></span> Online
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div style={styles.messagesArea}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                ...styles.messageRow,
                flexDirection: isUser ? 'row-reverse' : 'row'
              }}
            >
              <div
                style={{
                  ...styles.avatar,
                  backgroundColor: isUser ? '#1e293b' : '#e2e8f0',
                  color: isUser ? '#fff' : '#334155'
                }}
              >
                {isUser ? <User size={14} /> : <Bot size={14} />}
              </div>

              <div
                style={{
                  ...styles.messageBubble,
                  borderBottomRightRadius: isUser ? '4px' : '16px',
                  borderBottomLeftRadius: isUser ? '16px' : '4px'
                }}
              >
                {msg.text && (
                  <div style={styles.messageText}>
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.text}</ReactMarkdown>
                  </div>
                )}
                {msg.attachments && msg.attachments.length > 0 && msg.attachments.map((att, idx) => (
                  <div key={idx} style={styles.attachmentPill}>
                    <Paperclip size={13} color="#2563eb" />
                    <span style={styles.attachmentName}>{att.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div style={{ ...styles.messageRow, flexDirection: 'row' }}>
            <div style={{ ...styles.avatar, backgroundColor: '#e2e8f0', color: '#334155' }}>
              <Bot size={14} />
            </div>
            <div style={{ ...styles.messageBubble, borderBottomLeftRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
              <span style={{ fontSize: '0.875rem' }}>
                {messages.length === 0 ? "Initializing session..." : "Bot is thinking..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Multiple Attachments Preview Bar */}
      {attachments.length > 0 && (
        <div style={styles.previewBar}>
          <div style={styles.previewList}>
            {attachments.map((file, idx) => (
              <div key={idx} style={styles.previewPill}>
                <Paperclip size={14} color="#2563eb" />
                <span style={styles.previewFileName}>{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  style={styles.closePreviewBtn}
                  disabled={isLoading}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div style={styles.inputWrapper}>
        <div style={{
          ...styles.inputContainer,
        }}>
          <label style={styles.fileLabel}>
            <Paperclip size={20} color="#94a3b8" />
            <input type="file" multiple onChange={handleFileChange} style={styles.hiddenInput} disabled={isDisabled} />
          </label>
          <textarea
            rows={2}
            cols={80}
            style={{ ...styles.textarea, opacity: isDisabled ? 0.6 : 1, pointerEvents: isDisabled ? 'none' : 'auto' }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Connecting to session..." : "Type your message..."}
            
            disabled={isDisabled}
          />
          <button
            type="button"
            onClick={handleSend}
            style={{
              ...styles.sendButton,
              backgroundColor: '#2563eb',
              cursor: 'pointer'
            }}
          >
            <Send size={16} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    position: 'fixed',
    top: 0,
    left: 0,
    backgroundColor: '#ffffff',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
    zIndex: 9999
  },
  header: {
    padding: '1rem 1.5rem',
    background: 'linear-gradient(to right, #2563eb, #4f46e5)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
  },
  headerIcon: {
    padding: '0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '9999px',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    lineHeight: '1.25',
    margin: 0
  },
  headerSubtitle: {
    fontSize: '0.75rem',
    color: '#dbeafe',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    marginTop: '0.125rem'
  },
  onlineDot: {
    width: '0.5rem',
    height: '0.5rem',
    borderRadius: '9999px',
    backgroundColor: '#34d399',
    display: 'inline-block'
  },
  messagesArea: {
    flex: 1,
    padding: '1.5rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    backgroundColor: 'rgba(248, 250, 252, 0.5)'
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.625rem'
  },
  avatar: {
    width: '2rem',
    height: '2rem',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '0.75rem',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
  },
  messageBubble: {
    maxWidth: '75%',
    padding: '0.75rem 1rem',
    borderRadius: '1rem',
    fontSize: '0.875rem',
    lineHeight: '1.5',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    backgroundColor: '#ffffff',
    border: '1px solid #f1f5f9',
    color: '#0f172a'
  },
  messageText: {
    margin: 0,
    whiteSpace: 'pre-wrap'
  },
  attachmentPill: {
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.625rem',
    borderRadius: '0.5rem',
    backgroundColor: '#f1f5f9',
    color: '#0f172a'
  },
  attachmentName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  previewBar: {
    padding: '0.5rem 1.5rem',
    backgroundColor: 'rgba(241, 245, 249, 0.8)',
    borderTop: '1px solid #e2e8f0'
  },
  previewList: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap'
  },
  previewPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    padding: '0.375rem 0.75rem',
    borderRadius: '0.75rem',
    fontSize: '0.75rem',
    color: '#0f172a',
    fontWeight: '500'
  },
  previewFileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '150px'
  },
  closePreviewBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.125rem',
    color: '#94a3b8',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  inputWrapper: {
    padding: '1rem',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #f1f5f9'
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: 'rgba(226, 232, 240, 0.7)',
    border: '1px solid rgba(226, 232, 240, 0.5)',
    borderRadius: '1rem',
    padding: '0.75rem',
    transition: 'all 0.2s ease-in-out'
  },
  fileLabel: {
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0.625rem',
    borderRadius: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center'
  },
  hiddenInput: {
    display: 'none'
  },
  textarea: {
    flex: '1',
    backgroundColor: 'transparent',
    border: 'none',
    padding: '0.25rem 0',
    fontSize: '0.875rem',
    color: '#0f172a',
    outline: 'none',
    resize: 'none',
    maxHeight: '8rem',
    height: 'auto',
    overflow: 'hidden'
  },
  sendButton: {
    color: '#ffffff',
    border: 'none',
    padding: '0.75rem',
    borderRadius: '0.75rem',
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
  }
};