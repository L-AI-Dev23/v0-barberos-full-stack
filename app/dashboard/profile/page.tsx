'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { UserCircle2, Upload, Calendar, Check } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const supabase = createClient()

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [schedule, setSchedule] = useState<Profile['work_schedule']>(profile?.work_schedule || {})

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return

    setUploading(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${profile.id}/avatar.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      alert('No se pudo subir la foto. Intenta de nuevo.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    // Cache-bust so the new photo shows immediately
    const bustedUrl = `${publicUrl}?t=${Date.now()}`

    await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', profile.id)

    await refreshProfile()
    setUploading(false)
  }

  function toggleDay(day: string) {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        enabled: !prev[day]?.enabled,
        start: prev[day]?.start || '09:00',
        end: prev[day]?.end || '18:00',
      }
    }))
  }

  function updateTime(day: string, field: 'start' | 'end', value: string) {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      }
    }))
  }

  async function handleSaveSchedule() {
    if (!profile?.id) return
    setSaving(true)

    await supabase
      .from('profiles')
      .update({ work_schedule: schedule })
      .eq('id', profile.id)

    await refreshProfile()
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const daysLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
        <p className="text-muted-foreground">Gestiona tu foto y horario de trabajo</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5" />
            Foto de perfil
          </CardTitle>
          <CardDescription>Esta foto aparecerá en tu tarjeta de colaborador</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
              ) : (
                <UserCircle2 className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium">{profile?.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
          <div>
            <Label htmlFor="avatar-upload" className="cursor-pointer">
              <div className="inline-flex items-center gap-2 text-sm font-medium border rounded-md px-3 py-2 hover:bg-muted transition-colors">
                <Upload className="h-4 w-4" />
                {uploading ? 'Subiendo...' : 'Cambiar foto'}
              </div>
            </Label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleAvatarUpload}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Horario de trabajo
          </CardTitle>
          <CardDescription>Define los días y horas en que trabajas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {days.map((day, idx) => (
              <div key={day} className="flex items-center gap-2">
                <Switch
                  checked={schedule[day]?.enabled || false}
                  onCheckedChange={() => toggleDay(day)}
                />
                <span className="w-24 text-sm">{daysLabels[idx]}</span>
                {schedule[day]?.enabled && (
                  <>
                    <Input
                      type="time"
                      value={schedule[day]?.start || '09:00'}
                      onChange={(e) => updateTime(day, 'start', e.target.value)}
                      className="w-24 text-xs"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={schedule[day]?.end || '18:00'}
                      onChange={(e) => updateTime(day, 'end', e.target.value)}
                      className="w-24 text-xs"
                    />
                  </>
                )}
              </div>
            ))}
            <Button
              onClick={handleSaveSchedule}
              disabled={saving}
              size="sm"
              className="w-full mt-4"
            >
              {success ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  ¡Guardado!
                </>
              ) : saving ? 'Guardando...' : 'Guardar horario'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
