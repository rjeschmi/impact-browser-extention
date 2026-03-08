import type { ExtractFn } from "@impact/shared";
import { extract as priceExtract } from "../../../../extensions/rjeschmi/price_extraction/index.js";
import { extract as deadlineExtract } from "../../../../extensions/rjeschmi/deadline_extraction/index.js";
import { extract as keywordExtract } from "../../../../extensions/rjeschmi/keyword_extraction/index.js";

export const extensions: ExtractFn[] = [
	priceExtract,
	deadlineExtract,
	keywordExtract,
];
