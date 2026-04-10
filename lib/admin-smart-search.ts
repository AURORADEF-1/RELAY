export type SmartSearchEntity = "ticket" | "order" | "update" | "message" | "incident" | "task";

export type SmartSearchResult = {
  entity: SmartSearchEntity;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
  meta: string;
  score: number;
};

export type SmartSearchResponse = {
  query: string;
  results: SmartSearchResult[];
};
