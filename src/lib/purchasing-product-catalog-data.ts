// Source data for the Purchasing product catalog -- pulled from the team's
// Airtable "Product Database" base (see docs/airtable-product-catalog.md for
// the full pull notes and data-quality caveats). 115 products across the 10
// brand categories every org already gets by default (see
// defaultPurchasingCategoryRows in src/lib/ids.ts).
//
// Airtable only tracks product identity, not cost -- every row seeds at a
// $0 standard price, which needs a real value set from the Purchasing >
// Products screen before a product is used on a quotation.
export type PurchasingCatalogRow = {
  name: string;
  category: string;
  productCode: string | null;
  ndc: string | null;
  active: boolean;
  notes: string | null;
};

export const purchasingProductCatalog: PurchasingCatalogRow[] = [
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-013)-DME TAG",
    "category": "Dexcom",
    "productCode": "STP-FT-013",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 925",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Smartview 50ct Retail",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod (10 pack)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "True Metrix 100ct Black Trivida Boxes Only",
    "category": "True Metrix",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod Dash (5 pack)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Contour Next 100ct Retail (7312)",
    "category": "Contour",
    "productCode": "7312",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Aviva Plus 100ct Retail",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Contour Next 50ct (Yellow Label) (7308)",
    "category": "Contour",
    "productCode": "7308",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Precision Neo 25ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod Dash (10 pack)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 923",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Ultra 100ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 399",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Ultra 50ct (MO)",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "BD Pen Needles 4mm",
    "category": "BD Pen Needles",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Delica Plus 100ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": false,
    "notes": null
  },
  {
    "name": "Contour 100ct (7090G)",
    "category": "Contour",
    "productCode": "7090G",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod - 5 pack (Libre 2 Plus / Libre 3 Plus)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod - 5 pack G6/G7 DME",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Lite Meter",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 396",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-011)-NO DME TAG",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Autosoft XC infusion set",
    "category": "Tandem",
    "productCode": null,
    "ndc": null,
    "active": false,
    "notes": null
  },
  {
    "name": "Freestyle Libre 3 Sensor",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod - 5 pack (G6/G7) Retail",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 Receiver (013)",
    "category": "Dexcom",
    "productCode": "013",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Aviva Meter",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Contour 50ct (7080G)",
    "category": "Contour",
    "productCode": "7080G",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Delica Lancet",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "BD Pen Needles 8mm",
    "category": "BD Pen Needles",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Lite 100ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Verio 50ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod 5 Full Starter Kit (G6/G7)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Verio 100ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom Stelo Twin Pack (STP-XN-002)",
    "category": "Dexcom",
    "productCode": "STP-XN-002",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Guide 50ct",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Reservoirs MMT 332A",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Sensor Guardian 7040A",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Sensor Guardian 7020LA",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Transmitter (Stt-OR-001)",
    "category": "Dexcom",
    "productCode": "Stt-OR-001",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu Chek Guide Meter",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod (5 Pack)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 3 Plus",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Aviva Plus 50ct Mail Order",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Regular 50ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Sensors (STS-OE-003)",
    "category": "Dexcom",
    "productCode": "STS-OE-003",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-011)-NO DME TAG",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 14 Day READER",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Lite 50ct Institutional Use Only",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Precision Neo 50ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": "Brand pending administrator confirmation — left blank intentionally per source data."
  },
  {
    "name": "BD Pen Needles 6mm",
    "category": "BD Pen Needles",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Regular 100ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-011)-DME TAG",
    "category": "Dexcom",
    "productCode": "STP-FT-011",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Transmitter (Full Kit) (Stt-OE-002)",
    "category": "Dexcom",
    "productCode": "Stt-OE-002",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 2 READER",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Insulinx 100ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Verio Meter",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 398",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Silhouette MMT 381",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 244",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Guide 100ct",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 Receiver (011)",
    "category": "Dexcom",
    "productCode": "011",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Smartview 100ct Retail",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 965",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Transmitter (Stt-OM-001)",
    "category": "Dexcom",
    "productCode": "Stt-OM-001",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Sensors (STS-OR-003)",
    "category": "Dexcom",
    "productCode": "STS-OR-003",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-018)",
    "category": "Dexcom",
    "productCode": "STP-AT-018",
    "ndc": "08627-0077-01",
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-013)-NO DME TAG",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Ultrasoft Lancet",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Reservoirs MMT 326A",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 386",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 1 Count (Boxed)",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 921",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Receiver OM Model",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Ultra 25ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STE-FT-016)",
    "category": "Dexcom",
    "productCode": "STE-FT-016",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Ultra Meter",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-010)",
    "category": "Dexcom",
    "productCode": "STP-FT-010",
    "ndc": "08627-0079-01",
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-011)-DME TAG",
    "category": "Dexcom",
    "productCode": "STP-AT-011",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Aviva Plus 50ct Not For Pharmacy Benefit",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 213",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "OneTouch Ultra 50ct",
    "category": "OneTouch",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "True Metrix 50ct Black Trivida Boxes Only",
    "category": "True Metrix",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 943",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Receiver OE Model",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 14 Day Sensor",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Sensor Guardian 7020A",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod - 5 pack (G6/Libre 2 Plus)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Aviva Plus 50ct Retail",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Lite Lancet",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STE-AT-030)",
    "category": "Dexcom",
    "productCode": "STE-AT-030",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 3 READER",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 Receiver (012)",
    "category": "Dexcom",
    "productCode": "012",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Pump MMT 670G",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-013)-DME TAG",
    "category": "Dexcom",
    "productCode": "STP-AT-013",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "T-slim Cartridge",
    "category": "Tandem",
    "productCode": null,
    "ndc": null,
    "active": false,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 243",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Pump MMT 780G",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Guide 50ct NFR / Mail Order",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 945",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Pump MMT 630G",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 397",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Libre 2 Sensor",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-012)",
    "category": "Dexcom",
    "productCode": "STP-AT-012",
    "ndc": "08627-0077-01",
    "active": true,
    "notes": null
  },
  {
    "name": "Freestyle Lite 50ct",
    "category": "Freestyle",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Accu-Chek Guide 50ct OTC",
    "category": "Accu-Chek",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Contour Next 50ct Retail (7311)",
    "category": "Contour",
    "productCode": "7311",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Quickset MMT 242",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Omnipod 5 Full Starter Kit (G6/L2)",
    "category": "Omnipod",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G6 Sensors (STS-OM-003)",
    "category": "Dexcom",
    "productCode": "STS-OM-003",
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Medtronic Mio MMT 975",
    "category": "Medtronic",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 15 Day Sensor (STP-FT-012)",
    "category": "Dexcom",
    "productCode": "STP-FT-012",
    "ndc": "08627-0079-01",
    "active": true,
    "notes": null
  },
  {
    "name": "Dexcom G7 10 Day Sensor (STP-AT-013)-NO DME TAG",
    "category": "Dexcom",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  },
  {
    "name": "BD Pen Needles 5mm",
    "category": "BD Pen Needles",
    "productCode": null,
    "ndc": null,
    "active": true,
    "notes": null
  }
];
