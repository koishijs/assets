import { defineConfig } from '@koishijs/vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '@koishijs/assets',
  description: 'Koishi 资源存储服务',

  locales: {
    'zh-CN': require('./zh-CN'),
  },

  themeConfig: {
    indexName: 'cache',
    socialLinks: {
      github: 'https://github.com/koishijs/cache',
    },
  },
})
