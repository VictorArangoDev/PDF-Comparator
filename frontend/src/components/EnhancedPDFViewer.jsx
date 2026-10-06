import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const MIN_ZOOM = 50;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;

const PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjUwMCIgZmlsbD0iI0YzRjRGNiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGV4dCB4PSIxMDAiIHk9IjI1MCIgZm9udC1zaXplPSIxOCI+SW1hZ2VuIG5vIGVuY29udHJhZGE8L3RleHQ+PC9zdmc+";

// path.join en Windows devuelve "\" y eso rompe las URLs
const toUrl = (p) => (p ? String(p).replace(/\\/g, "/") : null);

const btn =
  "w-9 h-9 p-0 flex items-center justify-center border border-gray-300 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white";

export default function EnhancedPDFViewer({ comparisonData, onBackToResults }) {
  const { differences = [], imagesPath = "", totalPages = 0 } =
    comparisonData || {};

  // Solo se navega por las páginas que tienen diferencias
  // (el backend únicamente guarda las imágenes de esas páginas).
  const diffPages = useMemo(() => {
    const byPage = new Map();
    differences.forEach((d) => {
      if (d.hasDifference !== false) byPage.set(d.page, d);
    });
    return [...byPage.values()].sort((a, b) => a.page - b.page);
  }, [differences]);

  const total = diffPages.length;
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [showDifferences, setShowDifferences] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const drag = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const safeIndex = Math.min(index, Math.max(total - 1, 0));
  const current = diffPages[safeIndex];
  const hasPanels = Boolean(current);

  // Nuevo conjunto de diferencias → volver al inicio
  useEffect(() => {
    setIndex(0);
  }, [differences]);

  // Al cambiar de página, volver a la esquina superior izquierda
  useEffect(() => {
    [leftScrollRef, rightScrollRef].forEach((ref) => {
      if (ref.current) {
        ref.current.scrollTop = 0;
        ref.current.scrollLeft = 0;
      }
    });
  }, [current?.page]);

  // Sincronizar scroll entre las dos imágenes
  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;

    const sync = (src, dst) => () => {
      if (dst.scrollTop !== src.scrollTop) dst.scrollTop = src.scrollTop;
      if (dst.scrollLeft !== src.scrollLeft) dst.scrollLeft = src.scrollLeft;
    };
    const onLeft = sync(left, right);
    const onRight = sync(right, left);

    left.addEventListener("scroll", onLeft);
    right.addEventListener("scroll", onRight);
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
  }, [hasPanels]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const handleResetZoom = () => setZoom(100);
  const handlePrevious = () => setIndex(Math.max(safeIndex - 1, 0));
  const handleNext = () => setIndex(Math.min(safeIndex + 1, total - 1));

  // Arrastre con click sostenido (mouse o touch), con cualquier nivel de zoom.
  // Pointer capture: el arrastre continúa aunque el cursor salga del panel.
  const endDrag = (e) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const panHandlers = {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      drag.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
      setIsDragging(true);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d.active) return;
      e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
      e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const panStyle = {
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
  };

  // Rutas de la página actual (original, modificado y máscara de diferencias)
  const pageData = useMemo(() => {
    if (!current) return null;
    const missing = current.type === "added" || current.type === "removed";
    const resolve = (p, side) =>
      toUrl(p) ??
      (!missing && imagesPath
        ? `${imagesPath}/${side}/page-${current.page}.png`
        : null);

    return {
      ...current,
      originalImage: resolve(current.originalImage, "original"),
      modifiedImage: resolve(current.modifiedImage, "modified"),
      diffPath: toUrl(current.diffPath),
      highlightPath: toUrl(current.highlightPath),
    };
  }, [current, imagesPath]);

  const handleImageError = (e) => {
    const img = e.target;
    // Reintento único con .svg (placeholders antiguos) y luego imagen de reemplazo
    if (img.dataset.triedSvg !== "1" && img.src.endsWith(".png")) {
      img.dataset.triedSvg = "1";
      img.src = img.src.replace(/\.png$/, ".svg");
      return;
    }
    img.onerror = null;
    img.src = PLACEHOLDER;
  };

  if (!comparisonData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-12 text-center max-w-md border border-gray-200">
          <div className="text-6xl mb-4">📄</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            No hay datos de comparación
          </h2>
          <p className="text-gray-600">
            Por favor, realiza una comparación primero.
          </p>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-12 text-center max-w-md border border-gray-200">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Sin diferencias
          </h2>
          <p className="text-gray-600 mb-6">
            Las {totalPages} páginas comparadas son idénticas.
          </p>
          {onBackToResults && (
            <button
              onClick={onBackToResults}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Volver a resultados
            </button>
          )}
        </div>
      </div>
    );
  }

  // Panel de imagen (original o modificado). Si la página no existe en ese PDF
  // se muestra un aviso en lugar de una imagen rota.
  const renderPanelContent = (src, alt, showOverlay) => {
    if (!src) {
      return (
        <div className="m-auto text-sm text-gray-500 text-center px-6">
          {pageData.message || "Esta página no existe en este PDF"}
        </div>
      );
    }

    return (
      // El ancho en % del contenedor define el zoom. "m-auto" centra cuando la
      // imagen es más pequeña que el panel y permite llegar a todos los bordes
      // cuando es más grande (justify-center / items-center recortaba el inicio).
      <div className="relative m-auto shrink-0" style={{ width: `${zoom}%` }}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block w-full h-auto shadow-xl border border-gray-300 rounded-sm select-none"
          onError={handleImageError}
        />

        {showOverlay &&
          showDifferences &&
          (pageData.highlightPath || pageData.diffPath) && (
            <div className="absolute inset-0 pointer-events-none">
              {pageData.highlightPath ? (
                <img
                  src={pageData.highlightPath}
                  alt="Diferencias"
                  draggable={false}
                  className="block w-full h-full"
                  onError={(e) => {
                    if (pageData.diffPath) {
                      e.target.src = pageData.diffPath;
                      e.target.style.filter =
                        "brightness(0) saturate(100%) invert(15%) sepia(100%) saturate(7472%) hue-rotate(359deg) brightness(95%) contrast(118%)";
                      e.target.style.mixBlendMode = "multiply";
                    }
                  }}
                />
              ) : (
                <img
                  src={pageData.diffPath}
                  alt="Diferencias"
                  draggable={false}
                  className="block w-full h-full"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(27%) sepia(100%) saturate(7472%) hue-rotate(359deg) brightness(1.2) contrast(1.2)",
                    mixBlendMode: "screen",
                    opacity: 0.9,
                  }}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              )}
            </div>
          )}
      </div>
    );
  };

  const hasOverlay = Boolean(pageData.highlightPath || pageData.diffPath);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Navegación solo entre páginas con diferencias */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">
              Diferencia:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                disabled={safeIndex === 0}
                className={btn}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3">
                <input
                  type="number"
                  value={safeIndex + 1}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (n >= 1 && n <= total) setIndex(n - 1);
                  }}
                  className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                  min={1}
                  max={total}
                />
                <span className="text-sm text-gray-600">de {total}</span>
                <span className="text-sm text-gray-400">
                  (página {current.page} de {totalPages})
                </span>
              </div>
              <button
                onClick={handleNext}
                disabled={safeIndex >= total - 1}
                className={btn}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Zoom:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className={btn}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="min-w-16 text-center text-sm font-semibold text-gray-900">
                {zoom}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className={btn}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={handleResetZoom} className={btn}>
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mostrar / ocultar diferencias */}
          <button
            onClick={() => setShowDifferences(!showDifferences)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              showDifferences
                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
            }`}
          >
            {showDifferences ? (
              <>
                <Eye className="w-4 h-4" />
                Ocultar Diferencias
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                Mostrar Diferencias
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dos paneles */}
      <div className="flex flex-1 min-h-0 overflow-hidden bg-gray-100">
        {/* PDF 1 – Original */}
        <div className="flex flex-1 min-w-0 flex-col border-r border-gray-300 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span>📄</span>
              PDF Original
            </h3>
          </div>
          <div
            ref={leftScrollRef}
            className="flex flex-1 min-h-0 overflow-auto p-8 bg-gray-50 select-none"
            style={panStyle}
            {...panHandlers}
          >
            {renderPanelContent(pageData.originalImage, "PDF Original", false)}
          </div>
        </div>

        {/* PDF 2 – Comparado, con las diferencias encima */}
        <div className="flex flex-1 min-w-0 flex-col bg-white relative">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span>📝</span>
              PDF Comparado
            </h3>
          </div>
          <div
            ref={rightScrollRef}
            className="flex flex-1 min-h-0 overflow-auto p-8 bg-gray-50 select-none"
            style={panStyle}
            {...panHandlers}
          >
            {renderPanelContent(pageData.modifiedImage, "PDF Comparado", true)}
          </div>

          {showDifferences && hasOverlay && (
            <div
              className="absolute bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-xs font-medium border border-red-700 pointer-events-none"
              style={{ zIndex: 20 }}
            >
              🔍 Las áreas rojas indican diferencias
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
