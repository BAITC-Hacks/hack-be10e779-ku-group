// Сборка словаря (ru) из пространств имён. Каждое пространство — свой файл: так агенты и люди не правят один файл.
import app from './app'
import common from './common'
import steps from './steps'
import forecast from './forecast'
import february from './february'
import quality from './quality'
import project from './project'
import about from './about'
import footer from './footer'

export default { app, common, steps, forecast, february, quality, project, about, footer } as const
