const SOURCE_URL_PARAMETER = 'url'

export function readSharedSourceUrl(applicationUrl: string): string | undefined {
  const value = new URL(applicationUrl).searchParams.get(SOURCE_URL_PARAMETER)?.trim()
  return value || undefined
}

export function createShareableUrl(
  applicationUrl: string,
  sourceUrl: string,
): string {
  const url = new URL(applicationUrl)
  url.searchParams.set(SOURCE_URL_PARAMETER, sourceUrl)
  url.hash = ''
  return url.toString()
}

export function removeSharedSourceUrl(applicationUrl: string): string {
  const url = new URL(applicationUrl)
  url.searchParams.delete(SOURCE_URL_PARAMETER)
  url.hash = ''
  return url.toString()
}
