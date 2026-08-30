const SOURCE_URL_PARAMETER = 'url'

export function readSharedSourceUrl(applicationUrl: string): string | undefined {
  const url = new URL(applicationUrl)
  const rawValue = url.search
    .slice(1)
    .split('&')
    .find((parameter) => parameter.startsWith(`${SOURCE_URL_PARAMETER}=`))
    ?.slice(SOURCE_URL_PARAMETER.length + 1)
    .trim()

  if (!rawValue) return undefined
  if (/^https?:\/\//i.test(rawValue)) return rawValue

  try {
    return decodeURIComponent(rawValue.replaceAll('+', ' ')) || undefined
  } catch {
    return undefined
  }
}

export function readSharedSection(applicationUrl: string): string | undefined {
  const fragment = new URL(applicationUrl).hash.slice(1).trim()
  if (!fragment) return undefined

  try {
    return decodeURIComponent(fragment) || undefined
  } catch {
    return undefined
  }
}

export function createShareableUrl(
  applicationUrl: string,
  sourceUrl: string,
  section?: string,
): string {
  const url = new URL(applicationUrl)
  url.searchParams.delete(SOURCE_URL_PARAMETER)
  const remainingParameters = url.searchParams.toString()
  url.search = ''
  url.hash = ''
  const suffix = remainingParameters ? `&${remainingParameters}` : ''
  const fragment = section ? `#${encodeURI(section)}` : ''
  return `${url.toString()}?${SOURCE_URL_PARAMETER}=${sourceUrl}${suffix}${fragment}`
}

export function removeSharedSourceUrl(applicationUrl: string): string {
  const url = new URL(applicationUrl)
  url.searchParams.delete(SOURCE_URL_PARAMETER)
  url.hash = ''
  return url.toString()
}
