'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scissors, Info } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('fullName', fullName)
    formData.append('email', email)
    formData.append('password', password)
    formData.append('businessName', businessName)
    formData.append('invitationCode', invitationCode)

    const result = await signUp(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.needsEmailConfirmation) {
      router.push('/auth/verify-email')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Scissors className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join BarberOS to manage your barbershop</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-start gap-2 p-3 bg-muted rounded-md mb-4">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Fill in <strong>Business Name</strong> to create a new barbershop as admin, 
                  or use an <strong>Invitation Code</strong> to join an existing one as employee.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name (optional)</Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="My Barbershop"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value)
                    if (e.target.value) setInvitationCode('')
                  }}
                  disabled={!!invitationCode}
                />
              </div>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invitationCode">Invitation Code (optional)</Label>
                <Input
                  id="invitationCode"
                  type="text"
                  placeholder="ABCD1234"
                  value={invitationCode}
                  onChange={(e) => {
                    setInvitationCode(e.target.value.toUpperCase())
                    if (e.target.value) setBusinessName('')
                  }}
                  disabled={!!businessName}
                  className="uppercase"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
