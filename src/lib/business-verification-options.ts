// The choices people pick from on the business verification form. Kept apart from business-verification.ts (which uses the
// database) so the browser form can import them.

export const US_STATES: { code: string; name: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, name]) => ({ code, name }));

export const ENTITY_TYPES = [
  "LLC",
  "C corporation",
  "S corporation",
  "Partnership / LLP",
  "Sole proprietorship",
  "Nonprofit",
  "Other",
] as const;

export const BUSINESS_TYPES = [
  "Retailer / dealer",
  "Wholesaler / distributor",
  "Manufacturer",
  "Pharmacy",
  "Clinic / healthcare provider",
  "Other",
] as const;

export const PROOF_TYPES = [
  "IRS EIN letter (CP-575 or 147C)",
  "State registration or certificate of formation",
  "Certificate of good standing",
  "Other official document",
] as const;

export const MAX_PROOF_BYTES = 4 * 1024 * 1024;
export const MIN_DESCRIPTION = 20;
