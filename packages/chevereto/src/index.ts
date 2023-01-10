import { Context, Quester, Schema } from 'koishi'
import Assets from '@koishijs/assets'
import FormData from 'form-data'

class CheveretoAssets extends Assets<CheveretoAssets.Config> {
  types = ['image']
  http: Quester

  constructor(ctx: Context, config: CheveretoAssets.Config) {
    super(ctx, config)
    this.http = ctx.http.extend({
      endpoint: config.endpoint,
      headers: {
        'X-API-Key': config.token
      }
    })
  }

  async upload(url: string, file: string) {
    const { buffer, filename } = await this.analyze(url, file)
    const payload = new FormData()
    payload.append('source', buffer, filename)
    payload.append('key', this.config.token)
    payload.append('title', file)
    try {
      const data = await this.http.post('/api/1/upload', payload, { headers: payload.getHeaders() })
      return data.image.url
    } catch (e) {
      const error = new Error(e.response?.data?.error?.message || e.response?.message)
      return Object.assign(error, e.response?.data)
    }
  }

  async stats() {
    return {}
  }
}

namespace CheveretoAssets {
  export interface Config extends Assets.Config {
    token: string
    endpoint: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      token: Schema.string().description('访问令牌。').role('secret').required(),
      endpoint: Schema.string().role('link').description('服务器地址。').required()
    }),
    Assets.Config,
  ])
}

export default CheveretoAssets
