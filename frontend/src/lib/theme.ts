/** Значение CSS-переменной текущей темы, напр. cssVar('--primary'). Для цветов графиков ECharts. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
