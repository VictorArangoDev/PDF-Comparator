import express from "express";
import multer from "multer";
import path from "path";
import { PDFComparator } from "./PDFComparator.js";
import fs from "fs";


const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 3002;

// Asegurar carpetas base
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("output")) fs.mkdirSync("output");

// Middleware para CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Endpoint principal
app.post(
  "/api/compare",
  upload.fields([
    { name: "original", maxCount: 1 },
    { name: "modified", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("Archivos recibidos:", req.files);
      
      if (!req.files || !req.files["original"] || !req.files["modified"]) {
        return res.status(400).json({ 
          success: false, 
          message: "Se requieren ambos archivos PDF (original y modified)" 
        });
      }

      const original = req.files["original"][0].path;
      const modified = req.files["modified"][0].path;
      const timestamp = Date.now();
      const outputDir = path.join("output", `comparison-${timestamp}`);
      fs.mkdirSync(outputDir, { recursive: true });

      console.log("Iniciando comparación...");
      const comparator = new PDFComparator({ threshold: 0.1 });
      const result = await comparator.comparePDFs(original, modified, outputDir);

      // Preparar datos para el frontend
      const outputBasePath = `/output/comparison-${timestamp}`;
      const responseData = {
        timestamp: new Date().toLocaleString(),
        totalPages: result.stats.totalPages,
        differencesFound: result.stats.pagesWithDifferences,
        differences: result.differences.map(diff => {
          // Convertir rutas absolutas a rutas relativas para el frontend
          const getRelativePath = (absolutePath) => {
            if (!absolutePath) return null;
            // Si ya es una ruta relativa que empieza con /output, devolverla tal cual
            if (absolutePath.startsWith('/output') || absolutePath.startsWith('output')) {
              return absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`;
            }
            // Convertir ruta absoluta a relativa
            const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
            return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
          };

          return {
            type: 'visual',
            page: diff.page,
            field: 'page_content',
            original: diff.hasDifference && diff.diffPercentage !== undefined && diff.diffPercentage !== null 
              ? `${typeof diff.diffPercentage === 'number' ? diff.diffPercentage.toFixed(2) : diff.diffPercentage}% diferente` 
              : 'Idéntica',
            modified: diff.hasDifference ? 'Modificada' : 'Idéntica',
            diffPercentage: diff.diffPercentage,
            hasDifference: diff.hasDifference || false,
            diffPath: diff.diffPath ? getRelativePath(diff.diffPath) : (diff.hasDifference ? `${outputBasePath}/diffs/diff-page-${diff.page}.png` : null),
            highlightPath: diff.highlightPath ? getRelativePath(diff.highlightPath) : (diff.hasDifference ? `${outputBasePath}/highlights/highlight-page-${diff.page}.png` : null),
            originalImage: diff.originalImage ? getRelativePath(diff.originalImage) : `${outputBasePath}/images/original/page-${diff.page}.png`,
            modifiedImage: diff.modifiedImage ? getRelativePath(diff.modifiedImage) : `${outputBasePath}/images/modified/page-${diff.page}.png`,
            // Rutas SVG como fallback
            originalImageSvg: diff.originalImageSvg ? getRelativePath(diff.originalImageSvg) : `${outputBasePath}/images/original/page-${diff.page}.svg`,
            modifiedImageSvg: diff.modifiedImageSvg ? getRelativePath(diff.modifiedImageSvg) : `${outputBasePath}/images/modified/page-${diff.page}.svg`,
            diffPathSvg: diff.diffPathSvg ? getRelativePath(diff.diffPathSvg) : (diff.hasDifference ? `${outputBasePath}/diffs/diff-page-${diff.page}.svg` : null)
          };
        }),
        reportUrl: `${outputBasePath}/comparison_report.html`,
        imagesPath: `${outputBasePath}/images`,
        diffPath: `${outputBasePath}/diffs`
      };

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      console.error("Error en comparación:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Error interno del servidor" 
      });
    }


  }
);

// Endpoint para verificar estado de Poppler
app.get("/api/check-poppler", async (req, res) => {
  try {
    const comparator = new PDFComparator();
    const popplerInstalled = await comparator.checkPopplerInstallation();
    const imagemagickInstalled = await comparator.checkImageMagickInstallation();
    
    res.json({
      success: true,
      popplerInstalled: popplerInstalled,
      imagemagickInstalled: imagemagickInstalled,
      preferredMethod: popplerInstalled ? 'poppler' : (imagemagickInstalled ? 'imagemagick' : 'none'),
      message: popplerInstalled 
        ? "Poppler está instalado y funcionando (método preferido)" 
        : imagemagickInstalled
        ? "ImageMagick está instalado (método alternativo)"
        : "Ni Poppler ni ImageMagick están instalados. Ver INSTALACION_POPPLER.md para instrucciones"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      popplerInstalled: false,
      imagemagickInstalled: false,
      message: "Error al verificar herramientas de conversión: " + error.message
    });
  }
});

// Endpoint para verificar estado de ImageMagick (legacy)
app.get("/api/check-imagemagick", async (req, res) => {
  try {
    const comparator = new PDFComparator();
    const isInstalled = await comparator.checkImageMagickInstallation();
    
    res.json({
      success: true,
      imagemagickInstalled: isInstalled,
      message: isInstalled 
        ? "ImageMagick está instalado y funcionando" 
        : "ImageMagick no está instalado. Ver INSTALACION_IMAGEMAGICK.md para instrucciones"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      imagemagickInstalled: false,
      message: "Error al verificar ImageMagick: " + error.message
    });
  }
});


app.get("/api/cleanFolder", async(req, res)=>{
try {
  const deleteTempData = new PDFComparator();
  const clear = await deleteTempData.clearFolders();

  res.json({
    success:true,
    clean: clear,
    message: "Carpetas temporales depuradas"
  });

  
} catch (error) {
     res.status(500).json({
      success: false,
      clean: false,
      message: "Error al depurar las carpetas temporales: " + error.message
    });
}
});

app.get("/api/download-report", async (req, res) => {
  try {
    const pdfComparator = new PDFComparator();
    // Opcionalmente, se puede pasar la ruta del HTML como query parameter
    const htmlPath = req.query.htmlPath || null;
    return await pdfComparator.downloadPDFReport(res, htmlPath);

  } catch (error) {
    console.error("Error en el endpoint /api/download-report:", error);
    return res.status(500).json({ 
      success: false,
      error: "Error interno del servidor",
      message: error.message 
    });
  }
});


// Servir resultados estáticos
app.use("/output", express.static("output"));

app.listen(PORT, () =>
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`)
);
