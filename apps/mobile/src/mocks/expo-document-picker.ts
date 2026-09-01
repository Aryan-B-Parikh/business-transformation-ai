export async function getDocumentAsync(): Promise<{ canceled: boolean; assets?: Array<{ uri: string; name: string; mimeType?: string }> }> {
  return { canceled: true };
}
