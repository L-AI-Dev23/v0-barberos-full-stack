import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Scissors } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive">
            <Scissors className="h-6 w-6 text-destructive-foreground" />
          </div>
          <CardTitle className="text-2xl">Error de autenticación</CardTitle>
          <CardDescription>
            Algo salió mal durante la autenticación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground">
            El enlace de autenticación puede haber expirado o ya fue utilizado. 
            Por favor intenta iniciar sesión de nuevo o contacta a soporte si el problema persiste.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/auth/login">Intentar de nuevo</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/register">Crear nueva cuenta</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
