import { isIP } from 'node:net'

function isPrivateIPv4(hostname) {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  const [first, second] = octets
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127)
    || first >= 224
}

function isPrivateIPv6(hostname) {
  const normalized = hostname.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (/^(fc|fd|fe[89ab])/.test(normalized)) return true

  const mappedIPv4 = normalized.match(/^(?:::ffff:|(?:0:){5}ffff:)(.*)$/)
  if (!mappedIPv4) return false
  if (mappedIPv4[1].includes('.')) return isPrivateIPv4(mappedIPv4[1])

  const [highGroup, lowGroup] = mappedIPv4[1].split(':')
  if (!highGroup || !lowGroup || !/^[0-9a-f]{1,4}$/i.test(highGroup) || !/^[0-9a-f]{1,4}$/i.test(lowGroup)) return false
  const high = Number.parseInt(highGroup, 16)
  const low = Number.parseInt(lowGroup, 16)
  return isPrivateIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
}

export function isPublicHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return false
    }

    const ipVersion = isIP(hostname)
    if (ipVersion === 4) return !isPrivateIPv4(hostname)
    if (ipVersion === 6) return !isPrivateIPv6(hostname)
    return true
  } catch {
    return false
  }
}
