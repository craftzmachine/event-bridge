import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  // ExcelJS and pdfmake (+ its fonts) are loaded on demand when exporting, so their large chunks never block start-up
  build: { chunkSizeWarningLimit: 1400 },
  test: { environment: "node" },
} as never);
