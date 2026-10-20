// Serves the static /robots.txt unchanged and logs search / AI crawler fetches (see functions-lib/crawler-log.js).
import { logCrawler } from "../functions-lib/crawler-log.js";
export const onRequest = logCrawler;
