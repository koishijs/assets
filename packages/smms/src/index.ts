import { Context, HTTP, Schema } from 'koishi'
import Assets from '@koishijs/assets'

class SmmsAssets extends Assets<SmmsAssets.Config> {
  types = ['image']
  http: HTTP

  constructor(ctx: Context, config: SmmsAssets.Config) {
    super(ctx, config)
    this.http = ctx.http.extend({
      endpoint: config.endpoint,
      headers: { authorization: config.token },
    })
  }

  async upload(url: string, file: string) {
    const { buffer, filename, type } = await this.analyze(url, file)
    const payload = new FormData()
    payload.append('smfile', new Blob([buffer], { type }), filename)
    const data = await this.http.post('/upload', payload)
    if (data.code === 'image_repeated') {
      return data.images
    }
    if (!data.data) {
      const error = new Error(data.message)
      return Object.assign(error, data)
    }
    return data.data.url
  }

  async stats() {
    const data = await this.http('POST', '/profile')
    return {
      assetSize: data.data.disk_usage_raw,
    }
  }
}

namespace SmmsAssets {
  export interface Config extends Assets.Config {
    token: string
    endpoint?: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      token: Schema.string().description('SM.MS 的访问令牌。').role('secret').required(),
      endpoint: Schema.string().role('link').description('API 服务器地址。').default('https://smms.app/api/v2'),
    }),
    Assets.Config,
  ])
}

export default SmmsAssets
