import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useChat } from '../../hooks/useChat'
import { Spinner } from '../ui'
import { btn } from '../../design'
import { clockTime, dayLabel } from '../../utils/chat'

const MAX_BODY = 1000

function Bubble({ message }) {
  if (message.senderRole === 'SYSTEM') {
    return (
      <p className="mx-auto max-w-md rounded-full bg-sand px-3.5 py-1.5 text-center text-[11.5px] text-ink/55">
        {message.body}
      </p>
    )
  }
  return (
    <div className={`flex flex-col ${message.mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed sm:max-w-[75%] ${
          message.mine
            ? 'rounded-br-md bg-noir text-cream'
            : 'rounded-bl-md border border-line-warm bg-paper-warm text-ink'
        }`}
      >
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachments?.length > 0 && (
          <ul className={`space-y-1.5 ${message.body ? 'mt-2' : ''}`}>
            {message.attachments.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-[12px] underline ${message.mine ? 'text-cream/80' : 'text-clay'}`}
                >
                  Photo proof
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1 px-1 text-[10.5px] text-ink/40">{clockTime(message.createdAt)}</p>
    </div>
  )
}

/**
 * The chat that belongs to one booking. The server opens it when the provider
 * accepts and checks membership on every request; this component only renders
 * what that booking's thread returns.
 */
export default function BookingChat({ bookingId, enabled, closedText }) {
  const { subscribe } = useChat()
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const scroller = useRef(null)

  const markRead = useCallback(() => {
    api.post(`/services/chats/${bookingId}/read`).catch(() => {})
  }, [bookingId])

  useEffect(() => {
    if (!enabled || !bookingId) return undefined
    let active = true
    setLoaded(false)
    setError('')
    api
      .get(`/services/chats/${bookingId}/messages`, { params: { limit: 50 } })
      .then((res) => {
        if (!active) return
        setMessages(res.data.messages)
        setLoaded(true)
        markRead()
      })
      .catch((err) => active && (setError(getErrorMessage(err)), setLoaded(true)))
    return () => {
      active = false
    }
  }, [bookingId, enabled, markRead])

  useEffect(() => {
    if (!enabled) return undefined
    return subscribe((type, payload) => {
      if (type !== 'message' || payload.bookingId !== bookingId) return
      setMessages((list) => (list.some((m) => m._id === payload.message._id) ? list : [...list, payload.message]))
      if (!payload.message.mine) markRead()
    })
  }, [bookingId, enabled, markRead, subscribe])

  useLayoutEffect(() => {
    const box = scroller.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages])

  async function onSend(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError('')
    try {
      const res = await api.post(`/services/chats/${bookingId}/messages`, { body })
      setMessages((list) => (list.some((m) => m._id === res.data.message._id) ? list : [...list, res.data.message]))
      setDraft('')
    } catch (err) {
      setSendError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) onSend(event)
  }

  if (!enabled) {
    return (
      <p className="rounded-tile border border-dashed border-line-warm bg-canvas px-4 py-3 text-[12.5px] leading-relaxed text-ink/55">
        {closedText || 'Chat opens when the provider accepts the booking.'}
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-tile border border-line-warm bg-paper-warm">
      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label="Booking chat"
        className="max-h-80 min-h-40 space-y-3 overflow-y-auto bg-canvas/50 px-4 py-4"
      >
        {!loaded ? (
          <Spinner label="Loading messages…" />
        ) : error ? (
          <p className="text-[12.5px] text-clay">{error}</p>
        ) : messages.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-ink/50">
            <MessageCircle className="h-4 w-4 text-clay/70" aria-hidden="true" />
            No messages yet. Ask about the scope, access or price.
          </p>
        ) : (
          messages.map((message, index) => (
            <div key={message._id} className="space-y-3">
              {(index === 0 || dayLabel(messages[index - 1].createdAt) !== dayLabel(message.createdAt)) && (
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">
                  {dayLabel(message.createdAt)}
                </p>
              )}
              <Bubble message={message} />
            </div>
          ))
        )}
      </div>
      <form onSubmit={onSend} className="border-t border-line-warm p-3">
        {sendError && (
          <p role="alert" className="mb-2 rounded-tile border border-clay/25 bg-clay/5 px-3 py-2 text-[12.5px] text-clay">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor={`booking-chat-${bookingId}`} className="sr-only">
            Write a message
          </label>
          <textarea
            id={`booking-chat-${bookingId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_BODY}
            rows={2}
            placeholder="Write a message…"
            className="min-h-[44px] flex-1 resize-none rounded-tile border border-line-warm bg-paper-warm px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted/60 focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
          />
          <button type="submit" disabled={!draft.trim() || sending} className={btn('noir', 'md')}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
