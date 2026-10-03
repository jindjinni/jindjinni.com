/** Shared between the /api/address-autocomplete route and the client-side AddressAutocompleteFields component. */
export type AddressSuggestion = {
  label: string;
  street1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};
