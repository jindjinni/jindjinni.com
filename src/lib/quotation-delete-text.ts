// The words and shapes shared by the delete screens (no database code here, so the browser can import it).

export const DELETE_ALL_PHRASE = "DELETE ALL";

export type DeletionPreview = {
  /** Quotations picked (or all of them). */
  quotations: number;
  /** Of those, how many have no history and will be erased for good. */
  toDelete: number;
  /** Of those, how many already have received stock, a payment or a bought label: they are hidden (archived), never erased. */
  toHide: number;
  /** Why the hidden ones are kept (an order can be in more than one). */
  withReceiving: number;
  paid: number;
  labels: number;
};
