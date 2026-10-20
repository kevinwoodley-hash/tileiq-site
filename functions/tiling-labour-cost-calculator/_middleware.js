// Logs search / AI crawler visits to these pages (see functions-lib/crawler-log.js); the page itself is unchanged.
import { logCrawler } from "../../functions-lib/crawler-log.js";
export const onRequest = logCrawler;
