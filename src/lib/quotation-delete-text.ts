// The words and shapes shared by the delete screens (no database code here, so the browser can import it).

export const DELETE_ALL_PHRASE = "DELETE ALL";
export const DELETE_PAID_PHRASE = "DELETE";

export type DeletionPreview = {
  quotations: number;
  /** Orders that already have a receiving package (the package and its photos go too). */
  withReceiving: number;
  /** Orders already marked Paid by Accounts. */
  paid: number;
  /** Shipping labels already bought (deleting the order does not refund or void them). */
  labels: number;
};
