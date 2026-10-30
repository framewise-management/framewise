export class StudioLists {
  static readonly services: readonly string[] = ['Cinematic', 'Candid', 'Traditional Photo', 'Traditional Video', 'Drone']
  static readonly leadSources: readonly string[] = ['Reference', 'Instagram', 'Facebook', 'Others']
  static readonly budgets: readonly string[] = ['Agreed', 'Negotiation', 'Low']
  static readonly expenseCategories: readonly string[] = ['Camera Rent', 'Lens Rent', 'Drone Rent', 'Travelling', 'Fuel', 'Hotel', 'Food', 'Team Payment', 'Editing', 'Printing', 'Album', 'Courier', 'Other Expenses']
  static readonly deliveryItems: readonly string[] = ['Bride Album', 'Groom Album', 'Teaser', 'Highlight', 'Groom TV', 'Bride TV', 'Reels', 'Raw Data']
  static readonly eventTypes: readonly string[] = ['Pre-Wedding', 'Engagement', 'Mehndi', 'Sangeet', 'Haldi', 'Wedding', 'Reception', 'Birthday', 'Maternity', 'Other']
  static readonly paymentMethods: readonly string[] = ['Not set', 'UPI', 'Cash', 'Other', 'Bank transfer', 'Card', 'Cheque']

  // events store services as "Cinematic, Candid" text in legacy data
  static parseServices(value: string | readonly string[] | null | undefined): string[] {
    if (Array.isArray(value)) return [...value]
    return String(value || '').split(',').map(s => s.trim()).filter(Boolean)
  }
}
