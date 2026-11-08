import { HttpError } from "./auth";
export async function limitedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "Request exceeds size limit");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request exceeds size limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function bodyJson(req: Request) {
  try {
    return JSON.parse((await limitedBody(req, 1024 * 1024)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON body");
  }
}
export async function bodyForm(req: Request) {
  const bytes = await limitedBody(req, 101 * 1024 * 1024);
  return new Request(req.url, {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") || "" },
    body: bytes,
  }).formData();
}
