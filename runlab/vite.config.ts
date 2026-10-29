import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Application 100 % statique : une page, son script et ses données téléchargées par
// l'appareil. Hébergeable n'importe où (GitHub Pages…), sans serveur.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  // publié dans Menhir : rl/ à la racine du site (page « Parcours »)
  build: {
    target: "es2022",
    outDir: "../rl",
    emptyOutDir: true,
    sourcemap: false,
    // fichiers .mjs renommés en .js : l'app iPhone embarquée (capacitor://) ne sert les modules qu'avec l'extension .js
    rollupOptions: { output: { assetFileNames: (a: { names?: string[] }) => (a.names?.[0]?.endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]") } },
  },
});
