import { useState, useEffect, useCallback } from 'react'
import type { IngestionStats, EntityStats, BatchOperation, SystemHealth, ActivityItem } from '@/types'

const API_BASE = '/api'
const POLL_INTERVAL = 2000 // 2 seconds

export function useGatewayData() {
  const [stats, setStats] = useState<IngestionStats | null>(null)
  const [entities, setEntities] = useState<EntityStats[]>([])
  const [batches, setBatches] = useState<BatchOperation[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Fetch stats and status in parallel
      const [statsResponse, statusResponse] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/status`)
      ])

      if (!statsResponse.ok || !statusResponse.ok) {
        throw new Error('Failed to fetch data from API')
      }

      const statsData = await statsResponse.json()
      const statusData = await statusResponse.json()

      // Map API response to component state
      setStats({
        total: statsData.stats.total,
        processed: statsData.stats.processed,
        failed: statsData.stats.failed,
        ratePerSecond: statsData.stats.ratePerSecond,
        lastUpdate: new Date().toISOString()
      })

      setEntities(statsData.entities.map((e: any) => ({
        entity: e.entity,
        received: e.total,
        processed: e.processed,
        failed: e.failed,
        lastBatch: {
          size: e.total,
          duration: 0,
          timestamp: new Date().toISOString()
        }
      })))

      setBatches(statsData.batches || [])
      setActivity(statsData.activity || [])

      setHealth({
        status: statusData.status,
        uptime: statusData.uptime * 1000, // Convert to milliseconds
        memoryUsage: statusData.memoryUsage,
        cpuUsage: statusData.cpuUsage,
        activeConnections: statusData.activeConnections
      })

      setIsLoading(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  const resetMetrics = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/metrics/reset`, { method: 'POST' })
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset metrics')
    }
  }, [fetchData])

  return {
    stats,
    entities,
    batches,
    health,
    activity,
    isLoading,
    error,
    refresh: fetchData,
    resetMetrics
  }
}
