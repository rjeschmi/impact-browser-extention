import { z } from "zod";

// --- Page Visits ---

export const PageVisitSchema = z.object({
	url: z.string().url(),
	domain: z.string(),
	title: z.string(),
	visitedAt: z.number().int(),
	durationMs: z.number().int().nonnegative(),
	referrerUrl: z.string().url().nullable().optional(),
});

export type PageVisit = z.infer<typeof PageVisitSchema>;

export const PageVisitBatchSchema = z.array(PageVisitSchema).min(1).max(100);

export interface StoredPageVisit extends PageVisit {
	id: number;
}

// --- Extraction Extensions ---

export interface ExtractionContext {
	url: string;
	now: number;
}

export type ExtractFn = (ctx: ExtractionContext) => Extraction[];

// --- Extractions ---

export const ExtractionKind = z.enum([
	"price",
	"date",
	"deadline",
	"todo",
	"form",
	"keyword",
]);

export type ExtractionKind = z.infer<typeof ExtractionKind>;

export const ExtractionSchema = z.object({
	visitId: z.number().int().optional(),
	url: z.string().url(),
	kind: ExtractionKind,
	value: z.string(),
	context: z.string().optional(),
	metadata: z.string().optional(), // JSON blob
	extractedAt: z.number().int(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export interface StoredExtraction extends Extraction {
	id: number;
	isPinned: boolean;
}

// --- Suggestions ---

export const SuggestionType = z.enum([
	"revisit",
	"deadline",
	"price_change",
	"stale",
	"frequent",
]);

export type SuggestionType = z.infer<typeof SuggestionType>;

export const SuggestionStatus = z.enum([
	"active",
	"dismissed",
	"snoozed",
	"completed",
]);

export type SuggestionStatus = z.infer<typeof SuggestionStatus>;

export interface Suggestion {
	type: SuggestionType;
	title: string;
	body: string;
	url: string;
	priority: number;
	sourceAnalyzer: string;
}

export interface StoredSuggestion extends Suggestion {
	id: number;
	status: SuggestionStatus;
	createdAt: number;
	snoozedUntil: number | null;
}

export const SuggestionUpdateSchema = z.object({
	status: SuggestionStatus.optional(),
	snoozedUntil: z.number().int().nullable().optional(),
});

// --- Reminders ---

export const ReminderStatus = z.enum(["pending", "fired", "dismissed"]);

export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const ReminderCreateSchema = z.object({
	url: z.string().url().nullable().optional(),
	title: z.string().min(1),
	note: z.string().optional(),
	remindAt: z.number().int(),
});

export interface StoredReminder {
	id: number;
	url: string | null;
	title: string;
	note: string;
	remindAt: number;
	status: ReminderStatus;
	createdAt: number;
}
