import path from "node:path";
import fs from "node:fs/promises";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Reporte SOLO de diferencias, paginado (pageSize hojas por archivo HTML)
 * y con imágenes lazy. También escribe differences.json para consumirlo desde un front.
 */
export class ReportGenerator {
  constructor(pageSize = 50) {
    this.pageSize = pageSize;
  }

  fileName(i) {
    return i === 1 ? "comparison-report.html" : `comparison-report-${i}.html`;
  }

  async generate(differences, outputDir, stats) {
    this.outputDir = outputDir;
    await fs.writeFile(path.join(outputDir, "differences.json"), JSON.stringify({ stats, differences }));

    const totalPages = Math.max(1, Math.ceil(differences.length / this.pageSize));
    for (let i = 1; i <= totalPages; i++) {
      const slice = differences.slice((i - 1) * this.pageSize, i * this.pageSize);
      await fs.writeFile(path.join(outputDir, this.fileName(i)), this.html(slice, stats, i, totalPages));
    }
    return path.join(outputDir, this.fileName(1));
  }

  html(items, stats, page, totalPages) {
    const nav = `<nav>
      ${page > 1 ? `<a href="${this.fileName(page - 1)}">← Anterior</a>` : ""}
      <span>Bloque ${page} de ${totalPages}</span>
      ${page < totalPages ? `<a href="${this.fileName(page + 1)}">Siguiente →</a>` : ""}
    </nav>`;

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte de diferencias PDF</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;padding:20px;background:#f5f5f5}
  .container{max-width:1400px;margin:0 auto;background:#fff;padding:30px;border-radius:8px}
  .summary{display:flex;gap:30px;background:#f8f9fa;padding:20px;border-radius:6px;margin:20px 0}
  .stat b{display:block;font-size:2em;color:#0066cc}
  nav{display:flex;gap:16px;align-items:center;margin:16px 0}
  .page{margin:24px 0;padding:20px;border:1px solid #e0e0e0;border-left:4px solid #ff4444;border-radius:6px}
  .page h3{margin-bottom:10px}
  .images{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:15px}
  figure{text-align:center} img{max-width:100%;height:auto;border:1px solid #ddd;border-radius:4px}
  figcaption{margin-top:6px;color:#555}
</style></head><body><div class="container">
  <h1>Reporte de diferencias</h1>
  <div class="summary">
    <div class="stat"><b>${stats.totalPages}</b>Páginas comparadas</div>
    <div class="stat"><b>${stats.pagesWithDifferences}</b>Con diferencias</div>
    <div class="stat"><b>${stats.identicalPages}</b>Idénticas (no se muestran)</div>
  </div>
  ${nav}
  ${items.map(d => this.section(d)).join("")}
  ${nav}
</div></body></html>`;
  }

  // Ruta de la imagen relativa al HTML (que vive en outputDir), con "/" para el navegador
  rel(p) {
    return p ? path.relative(this.outputDir, p).split(path.sep).join("/") : null;
  }

  section(d) {
    const img = (src, label) =>
      src ? `<figure><img loading="lazy" decoding="async" src="${esc(this.rel(src))}" alt="${label}"><figcaption>${label}</figcaption></figure>` : "";
    const pct = d.diffPercentage ? ` — ${d.diffPercentage.toFixed(3)}% de píxeles` : "";
    return `
  <section class="page">
    <h3>Página ${d.page} <small>(${esc(d.type)}${pct})</small></h3>
    ${d.message ? `<p>${esc(d.message)}</p>` : ""}
    <div class="images">${img(d.originalImage, "Original")}${img(d.modifiedImage, "Modificado")}${img(d.diffPath, "Diferencias")}</div>
  </section>`;
  }

  generateSummary(stats) {
    const pct = stats.totalPages ? ((stats.pagesWithDifferences / stats.totalPages) * 100).toFixed(1) : "0.0";
    return [
      "RESUMEN DE COMPARACIÓN PDF",
      `Total de páginas:        ${stats.totalPages}`,
      `Páginas con diferencias: ${stats.pagesWithDifferences}`,
      `Páginas idénticas:       ${stats.identicalPages}`,
      `Porcentaje diferencia:   ${pct}%`,
      `Tiempo:                  ${(stats.elapsedMs / 1000).toFixed(1)} s`
    ].join("\n");
  }
}
