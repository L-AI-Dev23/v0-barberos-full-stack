'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

export type Period = 'today' | 'week' | 'month' | 'day' | 'range'

export interface DateFilterValue {
  period: Period
  // Para 'day': el día específico. Para 'range': el rango elegido.
  day?: Date
  range?: DateRange
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Convierte un DateFilterValue en un rango ISO { start, end } listo para usar
 * en queries de Supabase (.gte / .lte sobre created_at).
 */
export function resolveDateRange(value: DateFilterValue): { start: string; end: string } {
  const now = new Date()

  if (value.period === 'day' && value.day) {
    const start = new Date(value.day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(value.day)
    end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  if (value.period === 'range' && value.range?.from) {
    const start = new Date(value.range.from)
    start.setHours(0, 0, 0, 0)
    const end = new Date(value.range.to || value.range.from)
    end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const start = new Date()
  switch (value.period) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(now.getDate() - 7)
      break
    case 'month':
    default:
      start.setMonth(now.getMonth() - 1)
      break
  }
  return { start: start.toISOString(), end: now.toISOString() }
}

/** Etiqueta legible del período seleccionado, para mostrar debajo de las tarjetas. */
export function describeDateFilter(value: DateFilterValue): string {
  switch (value.period) {
    case 'today':
      return 'Hoy'
    case 'week':
      return 'Últimos 7 días'
    case 'month':
      return 'Últimos 30 días'
    case 'day':
      return value.day ? formatDate(value.day) : 'Día específico'
    case 'range':
      if (value.range?.from && value.range?.to) {
        return `${formatDate(value.range.from)} - ${formatDate(value.range.to)}`
      }
      if (value.range?.from) {
        return formatDate(value.range.from)
      }
      return 'Rango de fechas'
  }
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateFilterValue
  onChange: (value: DateFilterValue) => void
}) {
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(value.range)
  const [pendingDay, setPendingDay] = useState<Date | undefined>(value.day)
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false)
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={value.period}
        onValueChange={(v) => {
          const p = v as Period
          if (p === 'day' || p === 'range') return // se maneja con los popovers de abajo
          onChange({ period: p })
        }}
      >
        <TabsList>
          <TabsTrigger value="today">Hoy</TabsTrigger>
          <TabsTrigger value="week">Esta semana</TabsTrigger>
          <TabsTrigger value="month">Este mes</TabsTrigger>
        </TabsList>
      </Tabs>

      <Popover open={dayPopoverOpen} onOpenChange={setDayPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.period === 'day' ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            {value.period === 'day' && value.day ? formatDate(value.day) : 'Día específico'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={pendingDay}
            onSelect={(d) => {
              setPendingDay(d)
              if (d) {
                onChange({ period: 'day', day: d })
                setDayPopoverOpen(false)
              }
            }}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>

      <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.period === 'range' ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            {value.period === 'range' && value.range?.from
              ? describeDateFilter(value)
              : 'Rango de fechas'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={pendingRange}
            onSelect={(r) => {
              setPendingRange(r)
              if (r?.from && r?.to) {
                onChange({ period: 'range', range: r })
                setRangePopoverOpen(false)
              }
            }}
            captionLayout="dropdown"
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}