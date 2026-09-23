// Локальные хуки вкладки «Прогноз».

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** Подписка на media query без setState в эффекте. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Секунды с момента startedAt (обновляется раз в 250 мс); null — таймер не идёт. */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt == null) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [startedAt])
  return startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}
