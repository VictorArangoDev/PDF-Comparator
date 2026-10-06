import sharp from "sharp";

/** Parsea la cabecera de un PPM binario (P6). */
export function parsePPM(buf) {
  const isWs = c => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;
  let pos = 0;
  const tokens = [];

  while (tokens.length < 4) {
    while (isWs(buf[pos])) pos++;
    if (buf[pos] === 0x23) { // comentario
      while (buf[pos] !== 0x0a) pos++;
      continue;
    }
    const start = pos;
    while (!isWs(buf[pos])) pos++;
    tokens.push(buf.toString("ascii", start, pos));
  }
  pos++; // un único whitespace tras maxval

  return { width: Number(tokens[1]), height: Number(tokens[2]), offset: pos };
}

/** Convierte un buffer PPM a PNG (solo se usa para las páginas con diferencias). */
export async function ppmToPng(buf, pngPath) {
  const { width, height, offset } = parsePPM(buf);
  await sharp(buf.subarray(offset), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 3 })
    .toFile(pngPath);
}
