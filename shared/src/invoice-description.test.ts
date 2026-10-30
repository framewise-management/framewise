import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InvoiceDescription } from './invoice-description.ts'

const legacy = await import(new URL('../../legacy/dist/invoice-description.js', import.meta.url).href)

const texts = ['plain', '**Bold** and *italic* text', 'a **b', '***x***', '', '- one\n• **two**\n\n<script>*x*</script>']
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

test('runs and html match legacy', () => {
  for (const text of texts) {
    assert.deepEqual(InvoiceDescription.runs(text), legacy.descriptionRuns(text), text)
    assert.equal(InvoiceDescription.html(text, escape), legacy.descriptionHtml(text, escape), text)
  }
  assert.equal(InvoiceDescription.html(null, escape), legacy.descriptionHtml(null, escape))
})
