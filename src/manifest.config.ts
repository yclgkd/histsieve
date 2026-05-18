import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extName__",
  description: "__MSG_extDesc__",
  default_locale: "en",
  version: pkg.version,
  permissions: ["history", "alarms", "storage"],
  action: {
    default_popup: "src/ui/popup/index.html",
    default_title: "__MSG_extName__",
  },
  options_ui: {
    page: "src/ui/options/index.html",
    open_in_tab: true,
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  icons: {
    "16": "src/ui/icons/icon16.png",
    "32": "src/ui/icons/icon32.png",
    "48": "src/ui/icons/icon48.png",
    "128": "src/ui/icons/icon128.png",
  },
});
