/**
 * Receiving shipments never lock. A receiver who clicks the wrong thing, or an admin who needs to fix something,
 * can always go back in and change a shipment, even after it was submitted. Who may edit is still decided by role
 * (Owner / Admin / Receiver; Accountants for the accounting steps); view-only roles can't change anything.
 * Kept as one function so every action asks the same question.
 */
export async function isShipmentLocked(_pkg: { status: string; organizationId: string; quotationId: string }): Promise<boolean> {
  return false;
}
