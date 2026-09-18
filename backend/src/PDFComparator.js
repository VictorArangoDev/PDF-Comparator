import { EventEmitter } from "./utils/EventEmitter.js";
import { CONFIG } from "../config.js";
import { PopplerChecker } from "../src/services/PopplerChecker.js";
import { ImageComparator } from "../src/services/ImageComparator.js";
import { ReportGenerator } from "../src/services/ReportGenerator.js";
import { BatchProcessor } from "../src/services/BatchProcessor.js";
import { PDFLoader } from "./services/PDFLoader.js";
import { ImageConverter } from "../src/services/ImageConverter.js";
import { FileSystemManager } from "./utils/FileSystem.js";
import { PDFGenerator } from "./services/PDF-Generator.js";
import path from "path";
import fs from "fs/promises";

export class PDFComparator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...CONFIG, ...options };
    
    // Servicios
    this.popplerChecker = new PopplerChecker();
    this.pdfLoader = new PDFLoader();
    this.imageConverter = new ImageConverter(this.config, this.popplerChecker);
    this.imageComparator = new ImageComparator(this.config);
    this.reportGenerator = new ReportGenerator();
    this.pdfGenerator = new PDFGenerator();
    this.batchProcessor = new BatchProcessor(
    this.config.processing.batchSize,
    this.config.processing.maxConcurrent
    );

    // Almacenar la ruta del último reporte generado
    this.lastReportPath = null;

    // Reenviar eventos del batch processor
    this.batchProcessor.on("batchStart", data => this.emit("batchStart", data));
    this.batchProcessor.on("batchComplete", data => this.emit("batchComplete", data));
  }

  async compare(originalPath, modifiedPath, outputDir = "./output") {
    try {
      console.log("🔍 Iniciando comparación de PDFs...");
      
      // Validación
      FileSystemManager.validateFile(originalPath);
      FileSystemManager.validateFile(modifiedPath);
      await FileSystemManager.ensureDirectory(outputDir);

      // Cargar metadatos
      const [originalMeta, modifiedMeta] = await Promise.all([
        this.pdfLoader.getMetadata(originalPath),
        this.pdfLoader.getMetadata(modifiedPath)
      ]);

      const maxPages = Math.max(originalMeta.pageCount, modifiedMeta.pageCount);
      console.log(`📄 Original: ${originalMeta.pageCount} páginas`);
      console.log(`📄 Modificado: ${modifiedMeta.pageCount} páginas`);

      // Conversión a imágenes
      console.log("🖼️ Convirtiendo PDFs a imágenes...");
      const [originalImages, modifiedImages] = await Promise.all([
        this.imageConverter.convertPDFToImages(originalPath, outputDir, "original"),
        this.imageConverter.convertPDFToImages(modifiedPath, outputDir, "modified")
      ]);

      // Comparación por lotes
      console.log("⚖️ Comparando páginas en lotes...");
      const differences = await this.comparePagesBatch(
        originalImages,
        modifiedImages,
        outputDir
      );

      // Generación de reporte
      const reportPath = await this.reportGenerator.generate(differences, outputDir, {
        originalPath,
        modifiedPath,
        originalPages: originalMeta.pageCount,
        modifiedPages: modifiedMeta.pageCount
      });

      // Guardar la ruta del último reporte generado
      this.lastReportPath = reportPath;

      console.log(reportPath);

      const summary = this.reportGenerator.generateSummary(differences, maxPages);
      console.log("\n" + summary);
      console.log(`📊 Reporte generado: ${reportPath}`);

      return {
        success: true,
        differences,
        reportPath,
        summary,
        stats: {
          totalPages: maxPages,
          pagesWithDifferences: differences.filter(d => d.hasDifference).length,
          identicalPages: differences.filter(d => !d.hasDifference).length
        }
      };
    } catch (err) {
      console.error("❌ Error en comparación:", err.message);
      throw err;
    }
  }

  async comparePagesBatch(originalImages, modifiedImages, outputDir) {
    const diffDir = path.join(outputDir, "diffs");
    const highlightDir = path.join(outputDir, "highlights");
    await FileSystemManager.ensureDirectory(diffDir);
    await FileSystemManager.ensureDirectory(highlightDir);

    const maxPages = Math.max(originalImages.length, modifiedImages.length);
    const pageIndices = Array.from({ length: maxPages }, (_, i) => i);

    const results = await this.batchProcessor.process(
      pageIndices,
      async (pageIndex, _) => {
        return await this.compareSinglePage(
          pageIndex,
          originalImages,
          modifiedImages,
          diffDir,
          highlightDir,
          outputDir
        );
      }
    );

    return results;
  }

  async compareSinglePage(pageIndex, originalImages, modifiedImages, diffDir, highlightDir, outputDir) {
    const pageNum = pageIndex + 1;
    const originalImg = originalImages[pageIndex];
    const modifiedImg = modifiedImages[pageIndex];

    const originalImagePath = originalImg || path.join(outputDir, "images", "original", `page-${pageNum}.png`);
    const modifiedImagePath = modifiedImg || path.join(outputDir, "images", "modified", `page-${pageNum}.png`);
    const diffPath = path.join(diffDir, `diff-page-${pageNum}.png`);

    if (!originalImg || !modifiedImg) {
      return {
        page: pageNum,
        hasDifference: true,
        type: "missing",
        message: !originalImg ? "Página solo existe en PDF modificado" : "Página solo existe en PDF original",
        originalImage: originalImagePath,
        modifiedImage: modifiedImagePath,
        diffPath: null
      };
    }

    try {
      const comparison = await this.imageComparator.compare(originalImg, modifiedImg, diffPath);
      
      return {
        page: pageNum,
        hasDifference: !comparison.match,
        type: comparison.match ? "identical" : "different",
        diffPercentage: comparison.diffPercentage,
        originalImage: originalImagePath,
        modifiedImage: modifiedImagePath,
        diffPath: comparison.match ? null : diffPath
      };
    } catch (error) {
      console.warn(`⚠️ Error comparando página ${pageNum}:`, error.message);
      return {
        page: pageNum,
        hasDifference: true,
        type: "error",
        message: `Error: ${error.message}`,
        originalImage: originalImagePath,
        modifiedImage: modifiedImagePath,
        diffPath: null
      };
    }
  }

  // Alias para compatibilidad
  async comparePDFs(originalPath, modifiedPath, outputDir = "./output") {
    return this.compare(originalPath, modifiedPath, outputDir);
  }

  //limpia las rutas temporales
  async clearFolders() {
    const folders = this.config.paths;
    for (const property in folders) {
      const folder = folders[property];
      
      try {
        const files = await fs.readdir(folder);

        const unlinkPromises = files.map(async (file) => {
          const filePath = path.join(folder, file);
          const stat = await fs.lstat(filePath);
          if (stat.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
        });

        await Promise.all(unlinkPromises);
        console.log(`✅ Carpeta limpiada: ${folder}`);
      } catch (err) {
        console.error(`❌ Error limpiando ${folder}:`, err.message);
      }
    }
  }

  /**
   * Genera un PDF a partir del último reporte HTML generado
   * @param {object} res - Objeto de respuesta de Express para enviar el PDF
   * @param {string} htmlPath - Ruta opcional al archivo HTML (si no se proporciona, busca el último)
   * @returns {Promise<void>}
   */
  async downloadPDFReport(res, htmlPath = null) {
    try {
      // Determinar la ruta del HTML a convertir
      let reportHtmlPath = htmlPath || this.lastReportPath;

      // Si no hay ruta almacenada, buscar el último reporte generado
      if (!reportHtmlPath) {
        console.log("🔍 Buscando último reporte HTML generado...");
        reportHtmlPath = await this.pdfGenerator.findLatestReport(this.config.paths.output);
      }

      if (!reportHtmlPath) {
        return res.status(404).json({
          success: false,
          message: "No se encontró ningún reporte HTML para convertir a PDF"
        });
      }

      console.log(`📄 Convirtiendo reporte HTML a PDF: ${reportHtmlPath}`);

      // Generar el PDF desde el HTML
      const pdfBuffer = await this.pdfGenerator.generatePDFFromHTML(reportHtmlPath);

      // Cerrar el navegador después de generar el PDF para liberar recursos
      await this.pdfGenerator.closeBrowser();

      // Enviar el PDF como respuesta
      const fileName = `comparison-report-${Date.now()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("❌ Error generando PDF del reporte:", error);
      
      // Cerrar el navegador en caso de error
      try {
        await this.pdfGenerator.closeBrowser();
      } catch (closeError) {
        console.error("Error cerrando navegador:", closeError);
      }

      return res.status(500).json({
        success: false,
        message: `Error al generar PDF: ${error.message}`
      });
    }
  }

}
