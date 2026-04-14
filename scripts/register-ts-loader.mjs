import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LOADER_URL = pathToFileURL(join(SCRIPT_DIR, "ts-local-loader.mjs"));

register(LOADER_URL.href, pathToFileURL("./"));
