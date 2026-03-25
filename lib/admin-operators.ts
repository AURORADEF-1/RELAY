export const ADMIN_OPERATOR_OPTIONS = ["Scott", "Tom", "George"] as const;

export type AdminOperatorName = (typeof ADMIN_OPERATOR_OPTIONS)[number];
