import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Reemplaza a PDFLoader (pdf-lib) + PopplerChecker + pdf-poppler.
 * Llama directamente a pdfinfo / pdftoppm (Poppler) sin cargar el PDF en memoria de Node.
 */
export class PdfTools {
  constructor() {
    this.available = null;
  }

  async check() {
    if (this.available !== null) return this.available;
    try {
      await execFileAsync("pdftoppm", ["-v"]);
      await execFileAsync("pdfinfo", ["-v"]);
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async getPageCount(pdfPath) {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { maxBuffer: 10 * 1024 * 1024 });
    const m = stdout.match(/^Pages:\s+(\d+)/m);
    if (!m) throw new Error(`No se pudo leer el número de páginas de ${pdfPath}`);
    return Number(m[1]);
  }

  /**
   * Renderiza un rango de páginas a PPM (formato crudo, sin compresión PNG:
   * mucho más rápido de escribir y de leer). Devuelve Map<numeroPagina, rutaArchivo>.
   */
  async renderRange(pdfPath, first, last, outDir, dpi) {
    await fs.mkdir(outDir, { recursive: true });
    await execFileAsync(
      "pdftoppm",
      ["-r", String(dpi), "-f", String(first), "-l", String(last), pdfPath, path.join(outDir, "p")],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    // pdftoppm rellena con ceros según el total de páginas; extraemos el número con regex
    const map = new Map();
    for (const file of await fs.readdir(outDir)) {
      const m = file.match(/-(\d+)\.ppm$/);
      if (m) map.set(Number(m[1]), path.join(outDir, file));
    }
    return map;
  }
}
