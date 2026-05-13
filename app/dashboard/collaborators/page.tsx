'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus, Copy, Check, User, Calendar, Trash2, X } from 'lucide-react'
import type { Profile, InvitationCode, ModulePermissions } from '@/lib/types/database'

const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'services', label: 'Services' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'collaborators', label: 'Collaborators' },
  { key: 'pos', label: 'P.O.S.' },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'configuration', label: 'Configuration' },
] as const

export default function CollaboratorsPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [employeeSheetOpen, setEmployeeSheetOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<ModulePermissions>({})
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: employees, mutate: mutateEmployees } = useSWR<Profile[]>(
    profile?.organization_id ? 'employees' : null,
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .eq('role', 'employee')
        .order('full_name')
      return data || []
    }
  )

  const { data: invitationCodes, mutate: mutateInvitations } = useSWR<InvitationCode[]>(
    profile?.organization_id && isAdmin ? 'invitation-codes' : null,
    async () => {
      const { data } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .eq('used', false)
        .order('created_at', { ascending: false })
      return data || []
    }
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

  function openEmployeeSheet(emp: Profile) {
    setSelectedEmployee(emp)
    setEmployeeSheetOpen(true)
  }

  async function deleteEmployee(id: string) {
    if (!confirm('Remove this employee? They will lose access to the system.')) return
    
    // Delete the profile (auth user remains but can't access this org)
    await supabase.from('profiles').delete().eq('id', id)
    mutateEmployees()
    setEmployeeSheetOpen(false)
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

  function resetCreateSheet() {
    setPermissions({})
    setGeneratedCode(null)
    setCopied(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Collaborators</h1>
          <p className="text-muted-foreground">Manage your team members</p>
        </div>
        {isAdmin && (
          <Dialog open={createSheetOpen} onOpenChange={(open) => {
            setCreateSheetOpen(open)
            if (!open) resetCreateSheet()
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Create Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Employee Invitation</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-4">
                  <Label className="text-base">Module Permissions</Label>
                  <p className="text-sm text-muted-foreground">
                    Select which modules this employee can access.
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
                    {saving ? 'Generating...' : 'Generate Invitation Code'}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-2">Invitation Code</p>
                      <p className="text-2xl font-mono font-bold tracking-wider">{generatedCode}</p>
                    </div>
                    <Button onClick={copyCode} variant="outline" className="w-full">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Code
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Share this code with your employee. It can only be used once.
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
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitationCodes.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-mono font-medium">{inv.code}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(inv.module_permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => MODULES.find(m => m.key === k)?.label)
                      .filter(Boolean)
                      .join(', ') || 'No permissions'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employees Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {employees?.map((emp) => (
          <Card 
            key={emp.id} 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => isAdmin && openEmployeeSheet(emp)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{emp.full_name}</p>
                  <p className="text-sm text-muted-foreground truncate">{emp.email}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {Object.entries(emp.module_permissions || {})
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded">
                      {MODULES.find(m => m.key === k)?.label}
                    </span>
                  ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!employees || employees.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No employees yet. {isAdmin && 'Generate an invitation code to add team members.'}</p>
        </div>
      )}

      {/* Employee Detail Sheet */}
      <Sheet open={employeeSheetOpen} onOpenChange={setEmployeeSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedEmployee?.full_name}</SheetTitle>
          </SheetHeader>
          {selectedEmployee && (
            <div className="space-y-6 py-6">
              <div>
                <p className="text-sm text-muted-foreground">{selectedEmployee.email}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base">Work Schedule</Label>
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
                  Remove Employee
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
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
      {days.map((day) => (
        <div key={day} className="flex items-center gap-2">
          <Switch
            checked={localSchedule[day]?.enabled || false}
            onCheckedChange={() => toggleDay(day)}
          />
          <span className="w-24 text-sm capitalize">{day}</span>
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
        {saving ? 'Saving...' : 'Save Schedule'}
      </Button>
    </div>
  )
}
