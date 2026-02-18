import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toLocaleString()
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function formatTimestamp(date: string | Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

export function getEntityColor(entity: string): string {
  const colors: Record<string, string> = {
    'articulos': 'hsl(var(--entity-articulos))',
    'comprobantes_cabecera': 'hsl(var(--entity-cabecera))',
    'comprobantes_detalle': 'hsl(var(--entity-detalle))',
    'comprobantes_pagos': 'hsl(var(--entity-pagos))',
  }
  return colors[entity] || 'hsl(var(--primary))'
}

export function getEntityLabel(entity: string): string {
  const labels: Record<string, string> = {
    'articulos': 'Artículos',
    'comprobantes_cabecera': 'Comprobantes',
    'comprobantes_detalle': 'Detalles',
    'comprobantes_pagos': 'Pagos',
  }
  return labels[entity] || entity
}
