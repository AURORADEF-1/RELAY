export type RicoFeature = {
  name: string;
  value: string;
};

export type RicoImage = {
  cover: boolean;
  url: string;
};

export type RicoProduct = {
  id: number;
  reference: string;
  name: string;
  descriptionShort: string | null;
  price: number;
  quantity: number;
  manufacturerId: number | null;
  manufacturerName: string | null;
  categoryId: number | null;
  ean13: string | null;
  active: boolean;
  dateAdded: string | null;
  dateUpdated: string | null;
  commodityCode: string | null;
  countryOfOrigin: string | null;
  features: RicoFeature[];
  images: RicoImage[];
  matchedCrossReference: string | null;
};

export type RicoMachine = {
  machineId: number;
  manufacturer: string;
  model: string;
  series: string | null;
  engine: string | null;
  kits: RicoProduct[];
};

export type RicoProductsPage = {
  totalRecords: number;
  offset: number;
  count: number;
  products: RicoProduct[];
  checkedAt: string;
};

export type RicoCrossReferenceResult = {
  query: string;
  totalRecords: number;
  products: RicoProduct[];
  checkedAt: string;
};
