const SEQUENCE_SCALE = 1_000_000_000_000n;

export function sequenceToBigInt(sequence: string): bigint {
  const [wholePart, fractionalPart = ""] = sequence.split(".");
  const whole = BigInt(wholePart);
  const fractional = BigInt((fractionalPart + "0".repeat(12)).slice(0, 12));
  return whole * SEQUENCE_SCALE + fractional;
}

export function bigIntToSequence(value: bigint): string {
  const whole = value / SEQUENCE_SCALE;
  const fractional = value % SEQUENCE_SCALE;
  const fractionalText = fractional.toString().padStart(12, "0").replace(/0+$/, "");
  return fractionalText.length > 0 ? `${whole}.${fractionalText}` : whole.toString();
}

export function compareSequence(left: string, right: string) {
  const leftValue = sequenceToBigInt(left);
  const rightValue = sequenceToBigInt(right);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

export function isSequenceOnOrAfter(left: string, right: string) {
  return compareSequence(left, right) >= 0;
}

export function midpointSequence(previous?: string, next?: string) {
  if (!previous && !next) {
    return "1";
  }

  if (!previous && next) {
    const nextValue = sequenceToBigInt(next);
    return bigIntToSequence(nextValue / 2n);
  }

  if (previous && !next) {
    return bigIntToSequence(sequenceToBigInt(previous) + SEQUENCE_SCALE);
  }

  const previousValue = sequenceToBigInt(previous!);
  const nextValue = sequenceToBigInt(next!);

  if (nextValue - previousValue <= 1n) {
    throw new Error("No sortable gap exists between the requested sequence anchors.");
  }

  return bigIntToSequence(previousValue + (nextValue - previousValue) / 2n);
}
