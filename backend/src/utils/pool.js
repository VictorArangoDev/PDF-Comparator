/**
 * Pool de concurrencia sin "barreras": en cuanto un worker termina,
 * toma la siguiente tarea (a diferencia de Promise.all por chunks,
 * que espera siempre a la tarea más lenta del grupo).
 */
export async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
