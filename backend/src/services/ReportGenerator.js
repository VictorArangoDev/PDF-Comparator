import path from "path";
import fs from "fs/promises";

export class ReportGenerator {
  async generate(differences, outputDir, metadata) {
    const reportPath = path.join(outputDir, "comparison-report.html");
    const html = this.generateHTML(differences, metadata);
    await fs.writeFile(reportPath, html);
    return reportPath;
  }

  generateHTML(differences, metadata) {
    const pagesWithDiffs = differences.filter(d => d.hasDifference).length;
    const identicalPages = differences.length - pagesWithDiffs;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Comparación PDF</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; margin-bottom: 10px; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .stat { display: inline-block; margin-right: 30px; }
    .stat-value { font-size: 2em; font-weight: bold; color: #0066cc; }
    .stat-label { color: #666; font-size: 0.9em; }
    .page-comparison { margin: 30px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 6px; }
    .page-comparison.different { border-left: 4px solid #ff4444; }
    .page-comparison.identical { border-left: 4px solid #44ff44; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .page-number { font-size: 1.2em; font-weight: bold; }
    .status { padding: 4px 12px; border-radius: 4px; font-size: 0.85em; font-weight: 600; }
    .status.different { background: #ffe0e0; color: #cc0000; }
    .status.identical { background: #e0ffe0; color: #00cc00; }
    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
    .image-container { text-align: center; }
    .image-container img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
    .image-label { margin-top: 8px; font-weight: 500; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Reporte de Comparación de PDFs</h1>
    <p style="color: #666; margin-bottom: 20px;">Generado el ${new Date().toLocaleString('es-ES')}</p>
    
    <div class="summary">
      <div class="stat">
        <div class="stat-value">${differences.length}</div>
        <div class="stat-label">Total de páginas</div>
      </div>
      <div class="stat">
        <div class="stat-value">${pagesWithDiffs}</div>
        <div class="stat-label">Con diferencias</div>
      </div>
      <div class="stat">
        <div class="stat-value">${identicalPages}</div>
        <div class="stat-label">Idénticas</div>
      </div>
      <div class="stat">
        <div class="stat-value">${((pagesWithDiffs / differences.length) * 100).toFixed(1)}%</div>
        <div class="stat-label">Diferencia</div>
      </div>
    </div>

    ${differences.map(diff => this.generatePageSection(diff)).join('')}
  </div>
</body>
</html>`;
  }

  generatePageSection(diff) {
    const statusClass = diff.hasDifference ? 'different' : 'identical';
    const statusText = diff.hasDifference ? 'DIFERENTE' : 'IDÉNTICA';
    
    return `
    <div class="page-comparison ${statusClass}">
      <div class="page-header">
        <span class="page-number">Página ${diff.page}</span>
        <span class="status ${statusClass}">${statusText}</span>
      </div>
      ${diff.message ? `<p style="color: #666; margin-bottom: 15px;">${diff.message}</p>` : ''}
      <div class="images">
        <div class="image-container">
          <img src="${path.relative(path.dirname(diff.reportPath || '.'), diff.originalImage).replace("output", "..")}" alt="Original">
          <div class="image-label">Original</div>
        </div>
        <div class="image-container">
          <img src="${path.relative(path.dirname(diff.reportPath || '.'), diff.modifiedImage).replace("output", "..")}" alt="Modificado">
          <div class="image-label">Modificado</div>
        </div>
        ${diff.diffPath ? `
        <div class="image-container">
          <img src="${path.relative(path.dirname(diff.reportPath || '.'), diff.diffPath).replace("output", "..")}" alt="Diferencias">
          <div class="image-label">Diferencias</div>
        </div>
        ` : ''}
      </div>
    </div>`;
  }

  generateSummary(differences, totalPages) {
    const pagesWithDiffs = differences.filter(d => d.hasDifference).length;
    const identicalPages = differences.length - pagesWithDiffs;
    const percentage = ((pagesWithDiffs / totalPages) * 100).toFixed(1);

    return `
╔════════════════════════════════════════╗
║     RESUMEN DE COMPARACIÓN PDF        ║
╠════════════════════════════════════════╣
║ Total de páginas:        ${String(totalPages).padStart(12)} ║
║ Páginas con diferencias: ${String(pagesWithDiffs).padStart(12)} ║
║ Páginas idénticas:       ${String(identicalPages).padStart(12)} ║
║ Porcentaje diferencia:   ${String(percentage + '%').padStart(12)} ║
╚════════════════════════════════════════╝`;
  }
}
