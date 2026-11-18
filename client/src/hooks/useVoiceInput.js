import { useCallback, useEffect, useRef, useState } from 'react'

function recognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

const ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'We didn’t catch that. Try speaking again.',
  network: 'Voice search needs an internet connection.',
}

/**
 * Browser speech-to-text for search boxes (Web Speech API). It only hands back
 * the recognised text — the caller decides what to do and nothing is
 * submitted. Browsers without SpeechRecognition report supported: false, so
 * the mic can stay hidden instead of failing on a click.
 */
export function useVoiceInput(onResult) {
  const [supported] = useState(() => Boolean(recognitionCtor()))
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const resultRef = useRef(onResult)

  useEffect(() => {
    resultRef.current = onResult
  }, [onResult])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) return
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = document.documentElement.lang || 'en'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const text = (event.results?.[0]?.[0]?.transcript || '').trim()
      if (text) resultRef.current?.(text)
    }
    recognition.onerror = (event) => {
      // "aborted" is our own stop() or unmount; it needs no message.
      if (event.error !== 'aborted') setError(ERRORS[event.error] || 'Voice search could not start.')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    setError('')
    try {
      recognition.start()
      setListening(true)
    } catch {
      recognitionRef.current = null
      setError('Voice search could not start.')
    }
  }, [])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  const clearError = useCallback(() => setError(''), [])

  return { supported, listening, error, start, stop, clearError }
}
