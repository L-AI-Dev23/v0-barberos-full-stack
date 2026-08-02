'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus, Copy, Check, Calendar, Trash2, Sparkles } from 'lucide-react'
import type { Profile, InvitationCode, ModulePermissions } from '@/lib/types/database'

const WORK_DAYS = [
  { key: 'monday', label: 'L' },
  { key: 'tuesday', label: 'M' },
  { key: 'wednesday', label: 'M' },
  { key: 'thursday', label: 'J' },
  { key: 'friday', label: 'V' },
  { key: 'saturday', label: 'S' },
  { key: 'sunday', label: 'D' },
] as const

const MODULES = [
  { key: 'dashboard', label: 'Panel' },
  { key: 'services', label: 'Servicios' },
  { key: 'inventory', label: 'Inventario' },
  { key: 'collaborators', label: 'Colaboradores' },
  { key: 'pos', label: 'P.O.S.' },
  { key: 'loyalty', label: 'Fidelidad' },
  { key: 'appointments', label: 'Citas' },
  { key: 'configuration', label: 'Configuración' },
  { key: 'cash_register', label: 'Caja' },
] as const

export default function CollaboratorsPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<ModulePermissions>({})
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: employees, mutate: mutateEmployees } = useSWR<Profile[]>(
    profile?.organization_id ? `employees-${profile.organization_id}` : null,
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .eq('role', 'employee')
        .order('full_name')
      return data || []
    },
    { refreshInterval: 5000 }
  )

  const { data: invitationCodes, mutate: mutateInvitations } = useSWR<InvitationCode[]>(
    profile?.organization_id && isAdmin ? `invitation-codes-${profile.organization_id}` : null,
    async () => {
      const { data } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .eq('used', false)
        .order('created_at', { ascending: false })
      return data || []
    },
    { refreshInterval: 5000 }
  )

  function togglePermission(key: keyof ModulePermissions) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function generateCode() {
    if (!profile?.organization_id) return
    setSaving(true)

    // Generate random code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }

    const { error } = await supabase
      .from('invitation_codes')
      .insert({
        code,
        organization_id: profile.organization_id,
        created_by: profile.id,
        module_permissions: permissions,
      })

    if (!error) {
      setGeneratedCode(code)
      mutateInvitations()
    }

    setSaving(false)
  }

  async function copyCode() {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openEmployeeModal(emp: Profile) {
    setSelectedEmployee(emp)
    setEmployeeModalOpen(true)
  }

  async function deleteEmployee(id: string) {
    if (!confirm('Remove this employee? They will lose access to the system.')) return
    
    // Delete the profile (auth user remains but can't access this org)
    await supabase.from('profiles').delete().eq('id', id)
    mutateEmployees()
    setEmployeeModalOpen(false)
    setSelectedEmployee(null)
  }

  async function updateEmployeeSchedule(schedule: Profile['work_schedule']) {
    if (!selectedEmployee) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ work_schedule: schedule })
      .eq('id', selectedEmployee.id)
    
    setSelectedEmployee(prev => prev ? { ...prev, work_schedule: schedule } : null)
    mutateEmployees()
    setSaving(false)
  }

  async function updateEmployeeType(type: 'barbero' | 'equipo') {
    if (!selectedEmployee) return
    await supabase
      .from('profiles')
      .update({ employee_type: type })
      .eq('id', selectedEmployee.id)

    setSelectedEmployee(prev => prev ? { ...prev, employee_type: type } : null)
    mutateEmployees()
  }

  function resetCreateSheet() {
    setPermissions({})
    setGeneratedCode(null)
    setCopied(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Colaboradores</h1>
          <p className="text-muted-foreground">Gestiona tu equipo de trabajo</p>
        </div>
        {isAdmin && (
          <Dialog open={createSheetOpen} onOpenChange={(open) => {
            setCreateSheetOpen(open)
            if (!open) resetCreateSheet()
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="md:px-3">
                <UserPlus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Crear empleado</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Crear invitación de empleado</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-4">
                  <Label className="text-base">Permisos de módulos</Label>
                  <p className="text-sm text-muted-foreground">
                    Selecciona qué módulos puede acceder este empleado.
                  </p>
                  {MODULES.map((mod) => (
                    <div key={mod.key} className="flex items-center justify-between">
                      <Label htmlFor={mod.key} className="font-normal">{mod.label}</Label>
                      <Switch
                        id={mod.key}
                        checked={permissions[mod.key] || false}
                        onCheckedChange={() => togglePermission(mod.key)}
                      />
                    </div>
                  ))}
                </div>

                {!generatedCode ? (
                  <Button onClick={generateCode} disabled={saving} className="w-full">
                    {saving ? 'Generando...' : 'Generar código de invitación'}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-2">Código de invitación</p>
                      <p className="text-2xl font-mono font-bold tracking-wider">{generatedCode}</p>
                    </div>
                    <Button onClick={copyCode} variant="outline" className="w-full">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          ¡Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar código
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Comparte este código con tu empleado. Solo se puede usar una vez.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Pending Invitations */}
      {isAdmin && invitationCodes && invitationCodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitationCodes.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-mono font-medium">{inv.code}</p>
                    <p className="text-xs text-muted-foreground">
                      Creado {new Date(inv.created_at).toLocaleDateString('es-PE')}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(inv.module_permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => MODULES.find(m => m.key === k)?.label)
                      .filter(Boolean)
                      .join(', ') || 'Sin permisos'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employees Grid */}
      <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {employees?.map((emp) => (
          <Card
            key={emp.id}
            className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300 border border-border/80 p-0 py-0 pt-0 pb-0 gap-0 cursor-pointer"
            onClick={() => isAdmin && openEmployeeModal(emp)}
          >
            {/* Header Image or Premium Fallback - Más alargado (h-56) */}
            <div className="h-56 w-full relative bg-muted flex items-center justify-center overflow-hidden border-b border-border/40">
              {emp.avatar_url ? (
                <img
                  src={emp.avatar_url}
                  alt={emp.full_name}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 flex flex-col items-center justify-center gap-2">
                  <Sparkles className="h-8 w-8 text-violet-500/40 animate-pulse" />
                  <span className="text-xs text-muted-foreground/40 font-semibold tracking-widest uppercase select-none">BarberOS</span>
                </div>
              )}
            </div>

            <div className="px-5 pt-4 pb-5 flex-1 flex flex-col justify-between gap-3">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold text-foreground mr-1 truncate">{emp.full_name}</CardTitle>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(emp.module_permissions || {})
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <span key={k} className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 shrink-0">
                        {MODULES.find(m => m.key === k)?.label}
                      </span>
                    ))}
                  {Object.entries(emp.module_permissions || {}).filter(([, v]) => v).length === 0 && (
                    <span className="text-xs text-muted-foreground/60 italic">Sin módulos asignados</span>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-1">
                  {WORK_DAYS.map((d) => {
                    const active = emp.work_schedule?.[d.key]?.enabled
                    return (
                      <span
                        key={d.key}
                        className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground/40'
                        }`}
                      >
                        {d.label}
                      </span>
                    )
                  })}
                  {!emp.work_schedule && (
                    <span className="text-xs text-muted-foreground/60 italic ml-1">Sin horario</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(!employees || employees.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Sin empleados aún. {isAdmin && 'Genera un código de invitación para agregar miembros del equipo.'}</p>
        </div>
      )}

      {/* Employee Detail Dialog Modal */}
      <Dialog open={employeeModalOpen} onOpenChange={setEmployeeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.full_name}</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-6 py-4">
              <div>
                <p className="text-sm text-muted-foreground">{selectedEmployee.email}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-base">Tipo</Label>
                <Select
                  value={selectedEmployee.employee_type === 'equipo' ? 'equipo' : 'barbero'}
                  onValueChange={(v) => updateEmployeeType(v as 'barbero' | 'equipo')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="barbero">Barbero</SelectItem>
                    <SelectItem value="equipo">Equipo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Solo los colaboradores marcados como "Barbero" aparecen en la lista para elegir barbero al reservar una cita.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base">Horario de trabajo</Label>
                </div>
                <ScheduleEditor
                  schedule={selectedEmployee.work_schedule}
                  onSave={updateEmployeeSchedule}
                  saving={saving}
                />
              </div>

              <div className="pt-4 border-t">
                <Button 
                  variant="destructive" 
                  className="w-full"
                  onClick={() => deleteEmployee(selectedEmployee.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar empleado
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ScheduleEditor({
  schedule,
  onSave,
  saving,
}: {
  schedule: Profile['work_schedule']
  onSave: (schedule: Profile['work_schedule']) => void
  saving: boolean
}) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const daysLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const [localSchedule, setLocalSchedule] = useState(schedule || {})

  function toggleDay(day: string) {
    setLocalSchedule(prev => ({
      ...prev,
      [day]: {
        enabled: !prev[day]?.enabled,
        start: prev[day]?.start || '09:00',
        end: prev[day]?.end || '18:00',
      }
    }))
  }

  function updateTime(day: string, field: 'start' | 'end', value: string) {
    setLocalSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      }
    }))
  }

  return (
    <div className="space-y-3">
      {days.map((day, idx) => (
        <div key={day} className="flex items-center gap-2">
          <Switch
            checked={localSchedule[day]?.enabled || false}
            onCheckedChange={() => toggleDay(day)}
          />
          <span className="w-24 text-sm">{daysLabels[idx]}</span>
          {localSchedule[day]?.enabled && (
            <>
              <Input
                type="time"
                value={localSchedule[day]?.start || '09:00'}
                onChange={(e) => updateTime(day, 'start', e.target.value)}
                className="w-24 text-xs"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="time"
                value={localSchedule[day]?.end || '18:00'}
                onChange={(e) => updateTime(day, 'end', e.target.value)}
                className="w-24 text-xs"
              />
            </>
          )}
        </div>
      ))}
      <Button 
        onClick={() => onSave(localSchedule)} 
        disabled={saving}
        size="sm"
        className="w-full mt-4"
      >
        {saving ? 'Guardando...' : 'Guardar horario'}
      </Button>
    </div>
  )
}