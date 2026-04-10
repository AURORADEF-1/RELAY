export type SmartSearchEntity = "ticket" | "order" | "update" | "message" | "incident" | "task";
export type SmartSearchScope = "live" | "completed";

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
  scope: SmartSearchScope;
  results: SmartSearchResult[];
};
