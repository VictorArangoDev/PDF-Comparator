import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { CONFIG } from "../config.js";
import { PdfTools } from "./services/PdfTools.js";
import { ImageComparator } from "./services/ImageComparator.js";
import { ReportGenerator } from "./services/ReportGenerator.js";
import { ppmToPng } from "./services/ppm.js";
import { runPool } from "./utils/pool.js";

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(filePath)
      .on("data", d => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

export class PDFComparator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...CONFIG, ...options };

    const cmp = this.config.comparison ?? {};
    const proc = this.config.processing ?? {};
    this.dpi = cmp.dpi ?? 100;
    this.chunkSize = proc.chunkSize ?? 50; // páginas por proceso pdftoppm
    // Cada chunk lanza 2 procesos pdftoppm (original + modificado)
    this.concurrency = proc.concurrency ?? Math.max(1, Math.floor(os.cpus().length / 2));

    this.tools = new PdfTools();
    this.imageComparator = new ImageComparator(this.config);
    this.reportGenerator = new ReportGenerator(proc.reportPageSize ?? 50);
    this.lastReportPath = null;
  }

  async compare(originalPath, modifiedPath, outputDir = "./output") {
    const started = Date.now();

    if (!(await this.tools.check())) {
      throw new Error("Poppler (pdftoppm / pdfinfo) no está instalado o no está en el PATH");
    }
    await fs.mkdir(outputDir, { recursive: true });

    // ── Nivel 0: archivos idénticos byte a byte → nada que renderizar ──
    const [hashA, hashB] = await Promise.all([hashFile(originalPath), hashFile(modifiedPath)]);
    const [pagesA, pagesB] = await Promise.all([
      this.tools.getPageCount(originalPath),
      this.tools.getPageCount(modifiedPath)
    ]);
    const maxPages = Math.max(pagesA, pagesB);

    if (hashA === hashB) {
      return this.buildResult([], maxPages, started, outputDir, true);
    }

    // ── Nivel 1: renderizado por chunks, en paralelo, comparación en memoria ──
    const common = Math.min(pagesA, pagesB);
    const chunks = [];
    for (let s = 1; s <= common; s += this.chunkSize) {
      chunks.push([s, Math.min(s + this.chunkSize - 1, common)]);
    }

    let processed = 0;
    let found = 0;
    const chunkResults = await runPool(chunks, this.concurrency, async ([first, last]) => {
      const diffs = await this.compareChunk(originalPath, modifiedPath, first, last, outputDir);
      processed += last - first + 1;
      found += diffs.length;
      this.emit("progress", { processed, total: common, differences: found });
      return diffs;
    });

    const differences = chunkResults.flat().sort((a, b) => a.page - b.page);

    // Páginas que solo existen en uno de los dos PDFs
    for (let p = common + 1; p <= maxPages; p++) {
      differences.push({
        page: p,
        hasDifference: true,
        type: pagesA > pagesB ? "removed" : "added",
        message: pagesA > pagesB ? "Página solo existe en el PDF original" : "Página solo existe en el PDF modificado"
      });
    }

    return this.buildResult(differences, maxPages, started, outputDir, false);
  }

  /** Renderiza un rango de ambos PDFs a PPM en un tmp, compara en memoria y solo conserva lo que difiere. */
  async compareChunk(originalPath, modifiedPath, first, last, outputDir) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pdfcmp-"));
    try {
      const [a, b] = await Promise.all([
        this.tools.renderRange(originalPath, first, last, path.join(tmp, "a"), this.dpi),
        this.tools.renderRange(modifiedPath, first, last, path.join(tmp, "b"), this.dpi)
      ]);

      const diffs = [];
      for (let p = first; p <= last; p++) {
        const fa = a.get(p);
        const fb = b.get(p);
        if (!fa || !fb) {
          diffs.push({ page: p, hasDifference: true, type: "error", message: "No se pudo renderizar la página" });
          continue;
        }

        const [bufA, bufB] = await Promise.all([fs.readFile(fa), fs.readFile(fb)]);
        if (bufA.equals(bufB)) continue; // idéntica: no se escribe nada a disco

        const diff = await this.buildPageDiff(p, bufA, bufB, outputDir);
        if (diff) diffs.push(diff);
      }
      return diffs;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  /**
   * Solo se llama para páginas cuyos píxeles no son byte-idénticos.
   * Mantiene la estructura de rutas original que consume el comparador visual:
   *   <outputDir>/images/original/page-N.png
   *   <outputDir>/images/modified/page-N.png
   *   <outputDir>/diffs/diff-page-N.png
   */
  async buildPageDiff(page, bufA, bufB, outputDir) {
    const origDir = path.join(outputDir, "images", "original");
    const modDir = path.join(outputDir, "images", "modified");
    const diffDir = path.join(outputDir, "diffs");
    await Promise.all([
      fs.mkdir(origDir, { recursive: true }),
      fs.mkdir(modDir, { recursive: true }),
      fs.mkdir(diffDir, { recursive: true })
    ]);

    const originalImage = path.join(origDir, `page-${page}.png`);
    const modifiedImage = path.join(modDir, `page-${page}.png`);
    const diffPath = path.join(diffDir, `diff-page-${page}.png`);

    try {
      await Promise.all([ppmToPng(bufA, originalImage), ppmToPng(bufB, modifiedImage)]);
      const cmp = await this.imageComparator.compare(originalImage, modifiedImage, diffPath);

      if (cmp.match) { // diferencia dentro del umbral configurado → se considera idéntica
        await Promise.all([
          fs.rm(originalImage, { force: true }),
          fs.rm(modifiedImage, { force: true }),
          fs.rm(diffPath, { force: true })
        ]);
        return null;
      }

      return {
        page,
        hasDifference: true,
        type: cmp.reason === "layout-diff" ? "layout-diff" : "different",
        diffPercentage: cmp.diffPercentage,
        originalImage,
        modifiedImage,
        diffPath: cmp.reason === "layout-diff" ? null : diffPath
      };
    } catch (error) {
      return {
        page,
        hasDifference: true,
        type: "error",
        message: `Error: ${error.message}`,
        originalImage,
        modifiedImage,
        diffPath: null
      };
    }
  }

  async buildResult(differences, totalPages, started, outputDir, identical) {
    const stats = {
      totalPages,
      pagesWithDifferences: differences.length,
      identicalPages: totalPages - differences.length,
      elapsedMs: Date.now() - started
    };

    // Si no hay diferencias no se genera reporte
    let reportPath = null;
    if (differences.length > 0) {
      reportPath = await this.reportGenerator.generate(differences, outputDir, stats);
      this.lastReportPath = reportPath;
    }

    return {
      success: true,
      identical: identical || differences.length === 0,
      differences,
      reportPath,
      summary: this.reportGenerator.generateSummary(stats),
      stats
    };
  }

  /**
   * Compara varios pares y devuelve SOLO los pares que tienen diferencias.
   * pairs: [{ name, original, modified }]
   */
  async compareMany(pairs, baseOutputDir = "./output") {
    const withDifferences = [];
    for (const pair of pairs) { // secuencial: cada comparación ya usa todos los núcleos
      const result = await this.compare(pair.original, pair.modified, path.join(baseOutputDir, pair.name));
      if (!result.identical) withDifferences.push({ ...pair, ...result });
    }
    return withDifferences;
  }

  async comparePDFs(originalPath, modifiedPath, outputDir = "./output") {
    return this.compare(originalPath, modifiedPath, outputDir);
  }
}
