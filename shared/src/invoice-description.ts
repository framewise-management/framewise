export interface DescriptionRun {
  text: string
  bold?: boolean
  italic?: boolean
}

// a small formatting vocabulary (**bold**, *italic*, "- " bullets); no HTML is executed or imported
export class InvoiceDescription {
  static runs(text: string): DescriptionRun[] {
    const runs: DescriptionRun[] = []
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
    let index = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m.index > index) runs.push({ text: text.slice(index, m.index) })
      runs.push({ text: m[1] || m[2], bold: !!m[1], italic: !!m[2] })
      index = re.lastIndex
    }
    if (index < text.length) runs.push({ text: text.slice(index) })
    return runs
  }

  static html(text: string | null | undefined, escape: (s: string) => string): string {
    return String(text || '').split('\n').map(line => {
      const bullet = /^\s*[-•]\s+/.test(line)
      const content = bullet ? line.replace(/^\s*[-•]\s+/, '') : line
      const body = InvoiceDescription.runs(content)
        .map(run => run.bold ? '<strong>' + escape(run.text) + '</strong>' : run.italic ? '<em>' + escape(run.text) + '</em>' : escape(run.text))
        .join('')
      return `<div class="description-line${bullet ? ' description-bullet' : ''}">${bullet ? '<span aria-hidden="true">• </span>' : ''}${body || '<br>'}</div>`
    }).join('')
  }
}
