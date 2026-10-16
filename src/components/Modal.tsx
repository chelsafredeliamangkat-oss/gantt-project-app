import { useEffect } from 'react'
import type { FormEvent, ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /**
   * When provided, the body and footer are wrapped in a `<form>`. That keeps the
   * footer's submit button a real descendant of the form instead of relying on
   * the `form` attribute.
   */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

export function Modal({ title, onClose, children, footer, wide = false, onSubmit }: ModalProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            ×
          </button>
        </header>

        {onSubmit ? (
          <form className="modal-form" onSubmit={onSubmit} noValidate>
            <div className="modal-body">{children}</div>
            {footer ? <footer className="modal-foot">{footer}</footer> : null}
          </form>
        ) : (
          <>
            <div className="modal-body">{children}</div>
            {footer ? <footer className="modal-foot">{footer}</footer> : null}
          </>
        )}
      </div>
    </div>
  )
}
