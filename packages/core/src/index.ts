import { Context, h, Schema, Service } from 'koishi'
import { createHash } from 'crypto'
import { basename } from 'path'
import FileType from 'file-type'

declare module 'koishi' {
  interface Context {
    assets: Assets
  }
}

abstract class Assets<C extends Assets.Config = Assets.Config> extends Service {
  static filter = false
  static types = ['image', 'audio', 'video']

  protected types: readonly string[] = Assets.types

  abstract upload(url: string, file: string): Promise<string>
  abstract stats(): Promise<Assets.Stats>

  constructor(protected ctx: Context, public config: C) {
    super(ctx, 'assets')
  }

  public async transform(content: string) {
    return await h.transformAsync(content, Object.fromEntries(this.types.map((type) => {
      return [type, async (data) => {
        if (this.config.whitelist.some(prefix => data.url.startsWith(prefix))) {
          return h(type, data)
        } else {
          return h(type, { url: await this.upload(data.url, data.file) })
        }
      }]
    })))
  }

  protected async analyze(url: string, name = ''): Promise<Assets.FileInfo> {
    const file = await this.ctx.http.file(url)
    const buffer = Buffer.from(file.data)
    const hash = createHash('sha1').update(buffer).digest('hex')
    if (name) {
      name = basename(name)
      if (!name.startsWith('.')) {
        name = `-${name}`
      }
    } else {
      const fileType = await FileType.fromBuffer(buffer)
      if (fileType) {
        name = `.${fileType.ext}`
      }
    }
    return { buffer, hash, name, filename: `${hash}${name}` }
  }
}

namespace Assets {
  export interface Stats {
    assetCount?: number
    assetSize?: number
  }

  export interface FileInfo {
    buffer: Buffer
    hash: string
    name: string
    filename: string
  }

  export interface Config {
    whitelist?: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    whitelist: Schema.array(Schema.string().required().role('link')).description('不处理的白名单 URL 列表。'),
  })
}

export default Assets
