import { Context, Schema } from 'koishi'
import { ListObjectsCommand, PutObjectCommand, S3Client, S3ClientConfig } from '@aws-sdk/client-s3'
import Assets from '@koishijs/assets'

class S3Assets extends Assets<S3Assets.Config> {
  private s3: S3Client
  private publicUrl: string

  constructor(ctx: Context, config: S3Assets.Config) {
    super(ctx, config)
    this.publicUrl = config.publicUrl
    if (config.endpoint && !config.publicUrl) {
      // MinIO style public URL
      this.publicUrl = `${config.endpoint}/${config.bucket}/${config.pathPrefix}`
    }
    this.s3 = new S3Client(config)
  }

  stop() {
    this.s3.destroy()
  }

  private async listObjects(path: string) {
    const command = new ListObjectsCommand({
      Bucket: this.config.bucket,
      Prefix: path,
    })
    return this.s3.send(command)
  }

  async upload(url: string, file: string) {
    if (url.startsWith(this.publicUrl)) {
      return url
    }
    const { buffer, filename } = await this.analyze(url, file)
    const s3Key = `${this.config.pathPrefix}${filename}`
    const finalUrl = `${this.publicUrl}${filename}`
    const checkExisting = await this.listObjects(s3Key)
    if (checkExisting.Contents?.some((obj) => obj.Key === s3Key)) return finalUrl

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
        Body: buffer,
      }),
    )
    return finalUrl
  }

  async stats() {
    const data = await this.listObjects(this.config.pathPrefix)
    return {
      assetCount: data.Contents.length,
      assetSize: data.Contents.reduce((prev, curr) => prev + curr.Size, 0),
    }
  }
}

namespace S3Assets {
  const Credentials: Schema<S3ClientConfig['credentials']> = Schema.object({
    accessKeyId: Schema.string().required(),
    secretAccessKey: Schema.string().required(),
  })

  export interface Config extends S3ClientConfig, Assets.Config {
    bucket?: string
    pathPrefix?: string
    publicUrl?: string

    // override s3 client config for clarity
    region?: string
    endpoint?: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      region: Schema.string().default('none'),
      endpoint: Schema.string().role('link'),
      credentials: Credentials,
      bucket: Schema.string().required(),
      pathPrefix: Schema.string().default(''),
      publicUrl: Schema.string(),
    }),
    Assets.Config,
  ])
}

export default S3Assets
