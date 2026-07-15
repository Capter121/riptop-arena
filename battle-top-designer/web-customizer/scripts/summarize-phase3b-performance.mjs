export function summarizeSamples(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('At least one sample is required.');
  if (values.some(value => !Number.isFinite(value))) throw new Error('All samples must be finite.');

  const samples = [...values].sort((left, right) => left - right);
  const middle = Math.floor(samples.length / 2);
  const median = samples.length % 2 === 0
    ? (samples[middle - 1] + samples[middle]) / 2
    : samples[middle];
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  return { median, p95, samples };
}
