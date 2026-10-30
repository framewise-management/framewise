export class AmountWords {
  // Indian numbering (lakh, crore), as printed on invoices and receipts
  static inr(amount: number): string {
    const paise = Math.round((amount % 1) * 100)
    return 'Indian Rupees ' + words(Math.floor(amount)) + (paise ? ' and ' + words(paise) + ' Paise' : '') + ' Only'
  }
}

const SMALL = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function words(v: number): string {
  if (v < 20) return SMALL[v]
  if (v < 100) return TENS[Math.floor(v / 10)] + (v % 10 ? ' ' + words(v % 10) : '')
  if (v < 1000) return words(Math.floor(v / 100)) + ' Hundred' + (v % 100 ? ' ' + words(v % 100) : '')
  if (v < 100000) return words(Math.floor(v / 1000)) + ' Thousand' + (v % 1000 ? ' ' + words(v % 1000) : '')
  if (v < 10000000) return words(Math.floor(v / 100000)) + ' Lakh' + (v % 100000 ? ' ' + words(v % 100000) : '')
  return words(Math.floor(v / 10000000)) + ' Crore' + (v % 10000000 ? ' ' + words(v % 10000000) : '')
}
