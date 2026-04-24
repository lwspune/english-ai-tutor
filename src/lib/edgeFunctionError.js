export async function extractEdgeFunctionError(fnError) {
  try {
    const body = await fnError.context?.json()
    if (body?.error) return body.error
  } catch (_) {}
  return fnError.message
}
