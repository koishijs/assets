# API

## 公开方法

下面的公开方法可以直接通过 `ctx.assets` 使用。

### ctx.assets.transform(content)

- **content:** `string` 要处理的消息文本
- 返回值: `Promise<string>` 处理后的消息文本

将消息文本中的资源全部转存，并将链接替换为永久链接。

### ctx.assets.stats() <badge text="抽象" type="warning"/>

- 返回值: `Promise<Stats>` 服务状态信息

```ts
export interface Stats {
  assetCount?: number
  assetSize?: number
}
```

## 内部方法

要实现资源存储服务，你需要创建一个 Assets 的派生类。下面将介绍这个类的内部方法。

### assets.analyze(url, file?)

- **url:** `string` 资源 URL
- **file:** `string` 资源文件名
- 返回值: `Promise<FileInfo>` 文件信息

```ts
export interface FileInfo {
  name: string
  filename: string
  hash: string
  buffer: Buffer
}
```

### assets.upload(url, file) <Badge text="抽象" type="warning"/>

- **url:** `string` 资源 URL
- **file:** `string` 资源文件名
- 返回值: `Promise<string>` 永久链接

转存给定的资源文件，返回其对应的永久链接。
