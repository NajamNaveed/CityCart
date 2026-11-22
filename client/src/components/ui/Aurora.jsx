const TONES = {
  warm: [
    { color: 'var(--color-glow-rose)', className: 'left-[-14%] top-[-22%] h-[520px] w-[520px]', slow: false },
    { color: 'var(--color-glow-amber)', className: 'right-[-10%] top-[-10%] h-[460px] w-[460px]', slow: true },
    { color: 'var(--color-glow-sage)', className: 'bottom-[-30%] left-[24%] h-[420px] w-[420px]', slow: false },
  ],
  gold: [
    { color: 'var(--color-glow-amber)', className: 'left-[-8%] top-[-30%] h-[480px] w-[480px]', slow: true },
    { color: 'var(--color-glow-rose)', className: 'bottom-[-34%] right-[-6%] h-[440px] w-[440px]', slow: false },
  ],
  forest: [
    { color: 'var(--color-glow-sage)', className: 'left-[-12%] top-[-24%] h-[500px] w-[500px]', slow: false },
    { color: 'var(--color-glow-amber)', className: 'bottom-[-30%] right-[-8%] h-[420px] w-[420px]', slow: true },
  ],
}

/**
 * Decorative lighting behind a hero or panel. The parent needs `relative
 * overflow-hidden`; every blob is pointer-transparent.
 */
export default function Aurora({ tone = 'warm', className = '', intensity = 0.5 }) {
  const blobs = TONES[tone] ?? TONES.warm
  return (
    <div aria-hidden="true" className={`aurora ${className}`}>
      {blobs.map((blob, index) => (
        <span
          key={`${blob.className}-${index}`}
          className={`aurora-blob ${blob.className} ${blob.slow ? 'is-slow' : ''}`}
          style={{ background: blob.color, opacity: intensity }}
        />
      ))}
    </div>
  )
}
