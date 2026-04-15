import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const factorySettings = sqliteTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export type FactorySetting = typeof factorySettings.$inferSelect;
export type NewFactorySetting = typeof factorySettings.$inferInsert;
