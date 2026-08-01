/**
 * Configuración centralizada de Evolution API.
 *
 * La URL y la API Key del servidor Evolution API son las mismas para
 * TODAS las organizaciones (viven en variables de entorno del servidor,
 * nunca se exponen al cliente ni se guardan por organización).
 *
 * El nombre de instancia SÍ es único por organización, pero se genera
 * automáticamente a partir del organization_id (que ya es único),
 * así ningún negocio puede escribir un nombre repetido ni chocar
 * con la instancia de otro.
 */

export function getEvolutionApiUrl(): string {
  const url = process.env.EVOLUTION_API_URL
  if (!url) {
    throw new Error('Falta configurar la variable de entorno EVOLUTION_API_URL')
  }
  let sanitized = url.trim()
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    sanitized = `https://${sanitized}`
  }
  if (sanitized.endsWith('/')) {
    sanitized = sanitized.slice(0, -1)
  }
  return sanitized
}

export function getEvolutionApiKey(): string {
  const key = process.env.EVOLUTION_API_KEY
  if (!key) {
    throw new Error('Falta configurar la variable de entorno EVOLUTION_API_KEY')
  }
  return key
}

export function getInstanceName(organizationId: string): string {
  return `org-${organizationId}`
}
