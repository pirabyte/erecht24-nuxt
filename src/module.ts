import { addServerHandler, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: '@pirabyte/erecht24-nuxt',
    compatibility: { nuxt: '^3.17.5 || ^4.0.0' }
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const config = nuxt.options.runtimeConfig
    config.erecht24ApiKey ??= ''
    config.erecht24CacheDir ??= '.data/erecht24'

    addServerHandler({
      route: '/api/legal/:document',
      method: 'get',
      handler: resolver.resolve('./runtime/server/handler.js')
    })
  }
})
