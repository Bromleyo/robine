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
// Cuts at the first separator line (---), > quote, reply header (De : / From:),
// or Gmail-style intro line ("Le … a écrit :" / "On … wrote:").
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n')
  let cutAt = lines.length

  // Cut before an empty separator if present, otherwise at the line itself
  const cutBefore = (j: number) => (j > 0 && lines[j - 1]!.trim() === '' ? j - 1 : j)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (/^[-_]{5,}$/.test(line)) { cutAt = i; break }
    if (line.startsWith('>')) { cutAt = i; break }
    if (/^(De|From|Envoyé|Sent|À|To)\s*:/i.test(line) && i > 0 && lines[i - 1]!.trim() === '') {
      cutAt = i - 1; break
    }
    // Gmail/Outlook FR: "Le 23 avr. 2026 à 15:15, John <john@x.com> a écrit :"
    if (/^le\b.{1,300}\ba\s+[eé]crit\s*:/i.test(line)) { cutAt = cutBefore(i); break }
    // Gmail EN: "On Mon, Apr 23, 2026 at 3:15 PM, John <john@x.com> wrote:"
    if (/^on\b.{1,300}\bwrote\s*:/i.test(line)) { cutAt = cutBefore(i); break }
  }

  return lines.slice(0, cutAt).join('\n').trim()
}
