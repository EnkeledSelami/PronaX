export type EnvironmentMetric = "traffic" | "noise" | "environment";
export type DayProfile = "weekday" | "weekend";

// Illustrative local-use profile, not a measured Albania traffic time series.
const profiles: Record<DayProfile, number[]> = {
  weekday: [0.10, 0.08, 0.07, 0.06, 0.08, 0.16, 0.38, 0.68, 0.80, 0.62, 0.52, 0.55, 0.61, 0.57, 0.54, 0.61, 0.78, 0.94, 0.90, 0.70, 0.48, 0.34, 0.23, 0.14],
  weekend: [0.11, 0.09, 0.07, 0.07, 0.08, 0.10, 0.15, 0.24, 0.37, 0.53, 0.67, 0.77, 0.84, 0.80, 0.73, 0.72, 0.75, 0.72, 0.64, 0.51, 0.39, 0.29, 0.20, 0.14],
};

export function hourlyTrafficFactor(day: DayProfile, hour: number): number {
  return profiles[day][Math.max(0, Math.min(23, Math.round(hour)))];
}

export function estimatedRoadPressure(base: number, day: DayProfile, hour: number, metric: EnvironmentMetric): number {
  const factor = hourlyTrafficFactor(day, hour);
  const traffic = base * (0.20 + factor * 0.80);
  if (metric === "noise") return Math.min(100, traffic * 0.84 + base * 0.10);
  if (metric === "environment") return Math.min(100, traffic * 0.72 + base * 0.18);
  return Math.min(100, traffic);
}

export function pressureWord(value: number): string {
  if (value < 35) return "Lower";
  if (value < 68) return "Moderate";
  return "Higher";
}
