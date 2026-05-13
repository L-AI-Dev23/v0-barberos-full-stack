'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Building, Upload, Check, Image as ImageIcon } from 'lucide-react'

export default function ConfigurationPage() {
  const { profile, refreshProfile } = useAuth()
  const supabase = createClient()
  
  const [businessName, setBusinessName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (profile?.organizations) {
      setBusinessName(profile.organizations.name || '')
      setLogoUrl(profile.organizations.logo_url || null)
    }
  }, [profile])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.organization_id) return

    setUploading(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${profile.organization_id}/logo.${fileExt}`

    const { error: uploadError, data } = await supabase.storage
      .from('logos')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      alert('Failed to upload logo. Please try again.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName)

    setLogoUrl(publicUrl)
    setUploading(false)
  }

  async function handleSave() {
    if (!profile?.organization_id) return
    setSaving(true)

    const { error } = await supabase
      .from('organizations')
      .update({
        name: businessName.trim(),
        logo_url: logoUrl,
      })
      .eq('id', profile.organization_id)

    if (error) {
      alert('Failed to save settings. Please try again.')
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      refreshProfile()
    }

    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Gestiona los ajustes de tu organización</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Información del negocio
          </CardTitle>
          <CardDescription>
            Actualiza el nombre de tu negocio y logo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo Upload */}
          <div className="space-y-4">
            <Label>Logo del negocio</Label>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo del negocio"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <Label
                  htmlFor="logo-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Subiendo...' : 'Subir logo'}
                </Label>
                <Input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Recomendado: Imagen cuadrada, al menos 200x200px
                </p>
              </div>
            </div>
          </div>

          {/* Business Name */}
          <div className="space-y-2">
            <Label htmlFor="businessName">Nombre del negocio</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Nombre de tu barbería"
            />
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving || !businessName.trim()}
            className="w-full"
          >
            {saving ? 'Guardando...' : success ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                ¡Guardado!
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
