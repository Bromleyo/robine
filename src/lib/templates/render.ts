export function renderTemplate(body: string, ctx: Record<string, string>): string {
  return body.replace(/\{\{([\w.]+)\}\}/g, (_, key) => ctx[key] ?? `{{${key}}}`)
}
