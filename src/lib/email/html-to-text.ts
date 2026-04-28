export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Strips the quoted reply thread from an email body.
// Cuts at the first separator line (---), > quote, or reply header (De : / From:).
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n')
  let cutAt = lines.length

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^[-_]{5,}$/.test(line)) { cutAt = i; break }
    if (line.startsWith('>')) { cutAt = i; break }
    if (/^(De|From|Envoyé|Sent|À|To)\s*:/i.test(line) && i > 0 && lines[i - 1].trim() === '') {
      cutAt = i - 1; break
    }
  }

  return lines.slice(0, cutAt).join('\n').trim()
}
