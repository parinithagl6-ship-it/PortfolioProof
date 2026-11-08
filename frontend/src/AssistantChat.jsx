import { useState } from 'react'
import { Bot, LoaderCircle, MessageCircle, Send, X } from 'lucide-react'
import { api } from './api.js'

export default function AssistantChat({ signedIn, onSignIn }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (!signedIn) {
      onSignIn()
      return
    }

    const conversation = [...messages, { role: 'user', text }]
    setMessages(conversation)
    setDraft('')
    setError('')
    setSending(true)
    try {
      const { text: answer } = await api.chat(conversation)
      setMessages([...conversation, { role: 'model', text: answer }])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`assistant-widget ${open ? 'assistant-open' : ''}`}>
      {open && <section className="assistant-panel" aria-label="PortfolioProof AI assistant">
        <header className="assistant-header">
          <div className="assistant-badge"><Bot size={17} /></div>
          <div className="assistant-heading"><strong>Portfolio assistant</strong><span>Powered by Gemini</span></div>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={17} /></button>
        </header>
        <div className="assistant-messages" aria-live="polite">
          {!messages.length && <div className="assistant-empty">
            <div className="assistant-empty-icon"><MessageCircle size={20} /></div>
            <strong>What can I help you with?</strong>
            <p>Ask about your skills, projects, evidence, or anything else on your mind.</p>
            {!signedIn && <button className="text-link" onClick={onSignIn}>Log in to start chatting <Send size={13} /></button>}
          </div>}
          {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}`}>
            {message.role === 'model' && <span className="chat-avatar"><Bot size={13} /></span>}
            <p>{message.text}</p>
          </div>)}
          {sending && <div className="chat-message chat-assistant"><span className="chat-avatar"><Bot size={13} /></span><p className="chat-thinking"><LoaderCircle size={14} className="spin" /> Thinking...</p></div>}
          {error && <div className="assistant-error" role="alert">{error}</div>}
        </div>
        <div className="assistant-compose">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={signedIn ? 'Ask your assistant...' : 'Log in to chat...'}
            aria-label="Message the AI assistant"
            rows={2}
            maxLength={4000}
          />
          <button className="assistant-send" onClick={send} disabled={!draft.trim() || sending} aria-label="Send message">
            {sending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
          </button>
          <span className="assistant-hint">Enter to send · Shift+Enter for a new line</span>
        </div>
      </section>}
      <button className="assistant-launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}>
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {!open && <span>Ask AI</span>}
      </button>
    </div>
  )
}
