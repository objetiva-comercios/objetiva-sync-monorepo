import { useState, useEffect, useCallback, useRef } from 'react'
import type { EntityComparison } from '@/types'

const API_BASE = '/api'
const POLL_INTERVAL = 10_000 // 10 seconds

export function useSchemaComparison() {
  const [data, setData] = useState<EntityComparison[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  const getToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) {
      return tokenRef.current
    }
    const response = await fetch(`${API_BASE}/setup/token`, { method: 'POST' })
    if (!response.ok) {
      throw new Error('Failed to obtain auth token')
    }
    const body = await response.json()
    tokenRef.current = body.token
    return body.token
  }, [])

  const fetchData = useCallback(async () => {
    try {
      let token = await getToken()
      let response = await fetch(`${API_BASE}/schemas/compare`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      // On 401: clear cached token and retry once
      if (response.status === 401) {
        tokenRef.current = null
        token = await getToken()
        response = await fetch(`${API_BASE}/schemas/compare`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch schemas: ${response.status}`)
      }

      const json = await response.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schemas')
    } finally {
      setIsLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  return { data, isLoading, error, refresh: fetchData }
}
