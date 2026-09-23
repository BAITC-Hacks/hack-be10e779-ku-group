import type ru from '../ru/app'
import type { Dict } from '../../core'

const en: Dict<typeof ru> = {
  brand: { name: 'Anemo', title: 'Anemo — agentic wind farm output forecast', tagline: 'station time UTC+5', station: 'Wind farm, 2 turbines (Almaty region)' },
  tabs: {
    aria: 'Sections',
    forecast: 'Forecast',
    february: 'Period forecast',
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
      'Review mode for the expert: no LLM key needed, the same loop is run by a deterministic planner. Weather, model and calculations are real.',
    withoutLlm: 'no LLM',
    check: 'Review mode',
    noKey: '(no key)',
  },
  rollingWindow: 'rolling window',
  login: {
    login: 'Log in',
    logout: 'Log out',
    username: 'Username',
    password: 'Password',
    cancel: 'Cancel',
    testUsers: 'Test accounts for review:',
    needLogin: 'This action requires logging in.',
    noRights: 'You don’t have permission for this action — log in with one of the roles above.',
    dispatcher: 'dispatcher',
    analyst: 'analyst',
    admin: 'administrator',
    canDispatcher: 'forecast',
    canAnalyst: '+ backtest, autonomous run',
    canAdmin: '+ stations and turbines',
    demoUser: 'demonstrator',
    demoButton: 'Demonstrator',
    canDemo: 'demonstrator: all features',
    demoTitle: 'One-click sign-in with full rights (demo / demo): every feature visible and available',
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
