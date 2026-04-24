export async function extractEdgeFunctionError(fnError) {
  try {
    const body = await fnError.context?.json()
    if (body?.error) return body.error
  } catch { /* body not parseable — fall through to fnError.message */ }
  return fnError.message
}
