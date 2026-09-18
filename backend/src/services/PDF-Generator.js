import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { CONFIG } from "../../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PDFGenerator {
  constructor(options = {}) {
    this.config = { ...CONFIG.puppeteer, ...options };
    this.browser = null;
  }

  /**
   * Inicializa el navegador de Puppeteer
   * @returns {Promise<puppeteer.Browser>}
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: this.config.args || [],
      });
    }
    return this.browser;
  }

  /**
   * Cierra el navegador de Puppeteer
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Convierte las rutas relativas de imágenes a rutas absolutas file:// en el HTML
   * @param {string} htmlContent - Contenido HTML
   * @param {string} baseDir - Directorio base para resolver rutas relativas
   * @returns {string} HTML con rutas absolutas
   */
  normalizeImagePaths(htmlContent, baseDir) {
    const absoluteBaseDir = path.isAbsolute(baseDir)
      ? baseDir
      : path.resolve(process.cwd(), baseDir);

    // Buscar todas las etiquetas img con src
    return htmlContent.replace(
      /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
      (match, before, src, after) => {
        // Si ya es una URL absoluta (http, https, file://), dejarla como está
        if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("file://")) {
          return match;
        }

        // Resolver la ruta relativa a absoluta
        let absolutePath;
        if (path.isAbsolute(src)) {
          absolutePath = src;
        } else {
          // Normalizar la ruta relativa considerando el directorio base
          absolutePath = path.resolve(absoluteBaseDir, src);
        }

        // Normalizar separadores de ruta para Windows
        absolutePath = absolutePath.replace(/\\/g, "/");

        // Convertir a URL file://
        const fileUrl = `file:///${absolutePath}`;

        return `<img${before} src="${fileUrl}"${after}>`;
      }
    );
  }

  /**
   * Convierte un archivo HTML a PDF usando Puppeteer
   * @param {string} htmlPath - Ruta al archivo HTML
   * @param {string} outputPath - Ruta donde se guardará el PDF (opcional)
   * @param {object} options - Opciones adicionales para la generación del PDF
   * @returns {Promise<Buffer>} Buffer del PDF generado
   */
  async generatePDFFromHTML(htmlPath, outputPath = null, options = {}) {
      const fileUrl = `file://${htmlPath}`;
      let browser; 

    try {
     
      browser =  await puppeteer.launch(CONFIG.puppeteer);
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.goto(fileUrl, {waitUntil: 'load', timeout: 10000});
      await page.emulateMediaType('screen');
      await page.pdf({
        printBackground: true, 
        format: 'Letter',
        scale: 0.9,
      })

      // // Validar que el archivo HTML existe
      // await fs.access(htmlPath);

      // // Obtener la ruta absoluta del HTML
      // const absoluteHtmlPath = path.isAbsolute(htmlPath)
      //   ? htmlPath
      //   : path.resolve(process.cwd(), htmlPath);

      // const htmlDir = path.dirname(absoluteHtmlPath);

      // // Leer el contenido HTML
      // let htmlContent = await fs.readFile(absoluteHtmlPath, "utf-8");

      // // // Normalizar las rutas de imágenes a rutas absolutas file://
      // // htmlContent = this.normalizeImagePaths(htmlContent, htmlDir);

      // // Inicializar navegador
      // browser = await this.initBrowser();
      // const page = await browser.newPage();

      // // Configurar opciones por defecto del PDF
      // const pdfOptions = {
      //   format: "A4",
      //   printBackground: true,
      //   margin: {
      //     top: "20mm",
      //     right: "15mm",
      //     bottom: "20mm",
      //     left: "15mm",
      //   },
      //   displayHeaderFooter: false,
      //   ...options,
      // };

      // // Establecer el contenido HTML directamente (mejor que usar file://)
      // await page.setContent(htmlContent, {
      //   waitUntil: "networkidle0",
      //   timeout: 60000,
      // });

      // // Esperar a que las fuentes se carguen
      // await page.evaluateHandle("document.fonts.ready");

      // Esperar a que todas las imágenes se carguen completamente
      await page.evaluate(() => {
        return Promise.all(
          Array.from(document.images)
            .filter(img => !img.complete)
            .map(
              img =>
                new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
                  // Timeout después de 10 segundos
                  setTimeout(reject, 10000);
                })
            )
        );
      }).catch(() => {
        console.warn("⚠️ Algunas imágenes no se cargaron completamente");
      });


      // // Generar el PDF
      // const pdfBuffer = await page.pdf(pdfOptions);

      // Cerrar la página
      await page.close();

      // Si se especifica una ruta de salida, guardar el archivo
      if (outputPath) {
        const absoluteOutputPath = path.isAbsolute(outputPath)
          ? outputPath
          : path.resolve(process.cwd(), outputPath);
        
        await fs.writeFile(absoluteOutputPath, pdfBuffer);
        console.log(`✅ PDF generado exitosamente: ${absoluteOutputPath}`);
      }

      return pdfBuffer;
    } catch (error) {
      console.error("❌ Error generando PDF desde HTML:", error);
      throw new Error(
        `Error al generar PDF desde HTML: ${error.message}`
      );
    }
  }

  
  /**
   * Encuentra el último reporte HTML generado
   * @param {string} baseDir - Directorio base donde buscar (default: ./output)
   * @returns {Promise<string|null>} Ruta del último reporte HTML o null si no se encuentra
   */
  async findLatestReport(baseDir = "./output") {
    try {
      const absoluteBaseDir = path.isAbsolute(baseDir)
        ? baseDir
        : path.resolve(process.cwd(), baseDir);

      // Verificar que el directorio existe
      await fs.access(absoluteBaseDir);

      // Leer todos los subdirectorios
      const entries = await fs.readdir(absoluteBaseDir, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: path.join(absoluteBaseDir, entry.name),
        }));

      // Si no hay directorios, buscar directamente el archivo
      const directReportPath = path.join(absoluteBaseDir, "comparison-report.html");
      try {
        await fs.access(directReportPath);
        return directReportPath;
      } catch {
        // No existe en el directorio base
      }

      // Buscar en cada subdirectorio, ordenar por fecha de modificación
      const reportPaths = [];
      for (const dir of directories) {
        const reportPath = path.join(dir.path, "comparison-report.html");
        try {
          const stats = await fs.stat(reportPath);
          reportPaths.push({
            path: reportPath,
            mtime: stats.mtime,
          });
        } catch {
          // El archivo no existe en este directorio
        }
      }

      if (reportPaths.length === 0) {
        return null;
      }

      // Ordenar por fecha de modificación (más reciente primero)
      reportPaths.sort((a, b) => b.mtime - a.mtime);
      return reportPaths[0].path;
    } catch (error) {
      console.error("❌ Error buscando último reporte:", error);
      return null;
    }
  }
}
