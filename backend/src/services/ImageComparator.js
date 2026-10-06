import pkg from "odiff-bin";
const { compare: compareImages } = pkg;

export class ImageComparator {
  constructor(config) {
    this.config = config;
  }

  async compare(originalImg, modifiedImg, diffPath) {
    const result = await compareImages(originalImg, modifiedImg, diffPath, {
      threshold: this.config.comparison.threshold,
      antialiasing: this.config.comparison.antialiasing,
      outputDiffMask: true
    });

    return {
      match: result.match === true,
      reason: result.reason ?? null, // "pixel-diff" | "layout-diff" | ...
      // odiff ya entrega el porcentaje (0-100). Verifícalo con tu versión;
      // la heurística anterior convertía 0.5% en 50%.
      diffPercentage: Number(result.diffPercentage) || 0
    };
  }
}
