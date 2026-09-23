import type ru from '../ru/app'
import type { Dict } from '../../core'

const en: Dict<typeof ru> = {
  brand: { name: 'Anemo', title: 'Anemo — agentic wind farm output forecast', tagline: 'station time UTC+5', station: 'Wind farm, 2 turbines (Almaty region)' },
  tabs: {
    aria: 'Sections',
    forecast: 'Forecast',
    february: 'February 2026',
    quality: 'Model quality',
    project: 'About the project',
  },
  headline: {
    label: 'Day-ahead forecast error',
    vs: 'vs {value} for a simple estimate',
    title: 'Day-ahead forecast MAE, % of rated power · {period} · details on the “Model quality” tab',
  },
  mode: {
    liveTitle: 'An LLM decides the steps by calling tools. All numbers are computed by code.',
    demoTitle:
      'No LLM key set: the same loop is run by a deterministic planner. Weather, model and calculations are real.',
    withoutLlm: 'no LLM',
  },
  connecting: 'Connecting…',
  about: 'About the system',
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  language: { label: 'Interface language' },
  server: {
    retry: 'Retry',
    unavailable: 'Server unavailable: {error}. Make sure the app is running ({command}).',
  },
}
export default en
