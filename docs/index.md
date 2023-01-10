# 介绍

在一些情况下，我们需要非即时地处理含有资源消息段的消息，例如使用 [dialogue](https://dialogue.koishi.chat) 插件添加教学问答，或是在 [github](https://github.koishi.chat) 插件中快速回复等等。虽然可以直接将这些资源消息段发送出去，但由于涉及的消息会被长时间存储，将会导致一些潜在的问题：

- 部分平台提供的资源链接只对特定账户可用，因此发送出去的消息无法被其他平台解析
- 部分平台提供的资源链接并不是永久生效的，在一段时间后相应的内容将失效

为了解决这些问题，我们设计了资源存储服务。通过这个接口，我们可以将资源文件转存起来，并生成永久链接用于后续处理。

## 相关生态

以下是提供此服务的插件：

- [koishi-plugin-assets-git](./plugins/git.md)
- [koishi-plugin-assets-local](./plugins/local.md)
- [koishi-plugin-assets-remote](./plugins/remote.md)
- [koishi-plugin-assets-s3](./plugins/s3.md)
- [koishi-plugin-assets-smms](./plugins/smms.md)
- [koishi-plugin-assets-chevereto](./plugins/chevereto.md)

以下是使用此服务的插件：

- [koishi-plugin-github](https://github.koishi.chat)
- [koishi-plugin-dialogue](https://dialogue.koishi.chat)
