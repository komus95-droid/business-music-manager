import { useEffect, useRef, useCallback } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.bmm

interface UseUnsavedProps {
  isDirty: boolean
  onSave: () => Promise<void>
}

export function useUnsaved({ isDirty, onSave }: UseUnsavedProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Update window title with asterisk
  useEffect(() => {
    document.title = isDirty
      ? '● Business Music Manager'
      : 'Business Music Manager'
  }, [isDirty])

  // Autosave every 30 seconds if dirty
  useEffect(() => {
    if (!isDirty) return
    timerRef.current = setTimeout(() => { onSave() }, 30000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isDirty, onSave])

  // Warn before closing if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const save = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await onSave()
  }, [onSave])

  return { save }
}
