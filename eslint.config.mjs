import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "out/**", "src-tauri/**", "dist-portable/**", "WebView2Fixed/**", "tmp/**"],
  },
  ...nextVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // This application does not enable React Compiler. Keep the historical
      // Hooks/dependency checks, while deferring these two new compiler
      // constraints until a dedicated migration of the existing async screens.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
]);
