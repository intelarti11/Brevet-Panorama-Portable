import type { RenderableText } from "recharts"

export function formatChartNumber(
  value: RenderableText | null | undefined,
  digits = 1
) {
  return typeof value === "number" ? value.toFixed(digits) : ""
}

export function formatChartPercentage(
  value: RenderableText | null | undefined,
  minimumVisible = Number.NEGATIVE_INFINITY
) {
  if (typeof value !== "number" || value <= minimumVisible) {
    return ""
  }

  return `${value.toFixed(0)}%`
}
