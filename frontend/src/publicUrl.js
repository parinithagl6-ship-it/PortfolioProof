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

export function isPublicPortfolioUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return false
    }

    const ipv4 = hostname.match(/^\d{1,3}(?:\.\d{1,3}){3}$/)
    if (ipv4) return !isPrivateIPv4(hostname)
    if (hostname.includes(':')) {
      const mappedIPv4 = hostname.match(/^(?:::ffff:|(?:0:){5}ffff:)(.*)$/)
      if (mappedIPv4) {
        let address = mappedIPv4[1]
        if (!address.includes('.')) {
          const [highGroup, lowGroup] = address.split(':')
          if (!highGroup || !lowGroup || !/^[0-9a-f]{1,4}$/i.test(highGroup) || !/^[0-9a-f]{1,4}$/i.test(lowGroup)) return false
          const high = Number.parseInt(highGroup, 16)
          const low = Number.parseInt(lowGroup, 16)
          address = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
        }
        return !isPrivateIPv4(address)
      }
      return hostname !== '::' && hostname !== '::1' && !/^(fc|fd|fe[89ab]|2001:db8:)/.test(hostname)
    }
    return true
  } catch {
    return false
  }
}
