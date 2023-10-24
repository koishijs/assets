import { Context, Logger, sanitize, Schema, trimSlash } from 'koishi'
import { createReadStream, Stats } from 'fs'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'fs/promises'
import { basename, resolve } from 'path'
import { createHmac } from 'crypto'
import { stream as fileTypeStream } from 'file-type'
import Assets from '@koishijs/assets'

const logger = new Logger('assets')

class LocalAssets extends Assets<LocalAssets.Config> {
  static inject = ['router']

  private _task: Promise<void>
  private _stats: Assets.Stats = {
    assetCount: 0,
    assetSize: 0,
  }

  private path: string
  private root: string
  private selfUrl: string
  private noServer = false

  constructor(ctx: Context, config: LocalAssets.Config) {
    super(ctx, config)

    this.path = sanitize(config.path || '/files')
    this.root = resolve(ctx.baseDir, config.root)

    if (config.selfUrl) {
      this.selfUrl = trimSlash(config.selfUrl)
    } else if (!(this.selfUrl = ctx.root.config.selfUrl)) {
      logger.info('missing config "selfUrl", fallback to "file:" scheme')
      this.path = this.root.replace(/^\//, '')
      this.selfUrl = 'file:///'
      this.noServer = true
    }

    if (!this.noServer) this.initServer()
  }

  async _start() {
    const legacy = resolve(this.ctx.baseDir, 'public')
    await mkdir(this.root, { recursive: true })
    const stats: Stats = await stat(legacy).catch(() => null)
    if (stats?.isDirectory()) {
      logger.info('migrating to data directory')
      await cp(legacy, this.root)
      await rm(legacy, { recursive: true, force: true })
    }
    const filenames = await readdir(this.root)
    this._stats.assetCount = filenames.length
    await Promise.all(filenames.map(async (file) => {
      const { size } = await stat(resolve(this.root, file))
      this._stats.assetSize += size
    }))
  }

  start() {
    this._task = this._start()
  }

  async initServer() {
    this.ctx.router.get(this.path, async (ctx) => {
      return ctx.body = await this.stats()
    })

    this.ctx.router.get(this.path + '/:name', async (ctx) => {
      const filename = resolve(this.root, basename(ctx.params.name))
      const stream = await fileTypeStream(createReadStream(filename))
      ctx.type = stream.fileType?.mime
      return ctx.body = stream
    })

    this.ctx.router.post(this.path, async (ctx) => {
      const { salt, sign, url, file } = ctx.query
      if (Array.isArray(file) || Array.isArray(url)) {
        return ctx.status = 400
      }

      if (this.config.secret) {
        if (!salt || !sign) return ctx.status = 400
        const hash = createHmac('sha1', this.config.secret).update(file + salt).digest('hex')
        if (hash !== sign) return ctx.status = 403
      }

      return await this.upload(url, file)
    })
  }

  async write(buffer: Buffer, filename: string) {
    await writeFile(filename, buffer)
    this._stats.assetCount += 1
    this._stats.assetSize += buffer.byteLength
  }

  async upload(url: string, file: string) {
    if (url.startsWith(this.selfUrl)) return url
    await this._task
    const { selfUrl, path, root } = this
    const { buffer, filename } = await this.analyze(url, file)
    const savePath = resolve(root, filename)
    await this.write(buffer, savePath)
    return `${selfUrl}${path}/${filename}`
  }

  async stats() {
    await this._task
    return this._stats
  }
}

namespace LocalAssets {
  export interface Config extends Assets.Config {
    path?: string
    root?: string
    secret?: string
    selfUrl?: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      root: Schema.path({
        filters: ['directory'],
        allowCreate: true,
      }).default('data/assets').description('本地存储资源文件的相对路径。'),
      path: Schema.string().default('/files').description('静态图片暴露在服务器的路径。'),
      selfUrl: Schema.string().role('link').description('Koishi 服务暴露在公网的地址。缺省时将使用全局配置。'),
      secret: Schema.string().description('用于验证上传者的密钥，配合 assets-remote 使用。').role('secret'),
    }),
    Assets.Config,
  ])
}

export default LocalAssets
