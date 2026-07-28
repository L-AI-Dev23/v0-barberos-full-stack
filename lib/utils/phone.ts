export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1)
  }

  if (digits.length === 9) {
    digits = `51${digits}`
  }

  return digits
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone)
  return normalized.length >= 10 && normalized.length <= 15
}
