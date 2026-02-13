import { useEffect, useRef } from 'react'

/**
 * Custom hook for creating intervals with proper React lifecycle handling.
 *
 * Key features:
 * - Proper cleanup on unmount
 * - Supports dynamic delay changes
 * - Pass null to pause the interval
 * - Callback changes don't reset the interval
 *
 * @param callback - Function to call on each interval tick
 * @param delay - Interval in milliseconds, or null to pause
 *
 * @example
 * ```tsx
 * // Auto-refresh every 5 seconds
 * useInterval(() => {
 *   refetch()
 * }, 5000)
 *
 * // Conditional refresh (pause when paused is true)
 * useInterval(() => {
 *   refetch()
 * }, isPaused ? null : 5000)
 * ```
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback)

  // Remember the latest callback if it changes
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    // Don't schedule if delay is null (paused)
    if (delay === null) {
      return
    }

    const tick = () => {
      savedCallback.current()
    }

    const id = setInterval(tick, delay)

    // Cleanup on unmount or when delay changes
    return () => {
      clearInterval(id)
    }
  }, [delay])
}
