import { $, Context, Schema, sleep, Time } from 'koishi'
import Git, { ResetMode, SimpleGit, SimpleGitOptions } from 'simple-git'
import Assets from '@koishijs/assets'
import { promises as fsp } from 'fs'
import { join, resolve } from 'path'
import { File, FileInfo, Task } from './file'

const { access, mkdir, rename, writeFile } = fsp

export interface Branch {
  branch: number
  size: number
}

function toBranchName(id: number) {
  return id.toString(36).padStart(8)
}

class GitAssets extends Assets<GitAssets.Config> {
  static inject = ['database']

  git: SimpleGit
  taskQueue: Task[] = []
  taskMap = new Map<string, Task>()
  isActive = false

  constructor(ctx: Context, config: GitAssets.Config) {
    super(ctx, config)

    ctx.model.extend('assets', {
      id: 'integer',
      hash: 'string',
      name: 'string',
      branch: 'integer',
      size: 'integer',
    }, {
      autoInc: true,
    })
  }

  async start() {
    await this.initRepo()
    this.isActive = true
    while (this.isActive) {
      try {
        await this.mainLoop()
      } catch (e) {
        this.logger.warn(`Loop failed: ${e.toString()}`)
      }
    }
  }

  stop() {
    this.isActive = false
  }

  private async initRepo() {
    const { git, github: { user, repo, token } } = this.config
    try {
      await access(join(git.baseDir, '.git'))
      this.git = Git(this.config.git)
    } catch (e) {
      this.logger.debug(`initializing repo at ${git.baseDir} ...`)
      await mkdir(git.baseDir, { recursive: true })
      this.git = Git(this.config.git)
      await this.git
        .init()
        .addRemote('origin', `https://${token}@github.com/${user}/${repo}.git`)
        .addConfig('core.autocrlf', 'false', false)
      await this.checkout(false, true)
      this.logger.debug('repository is initialized successfully')
    }
  }

  private async getBranch(forceNew?: boolean, offset = 1): Promise<Branch> {
    const [file] = await this.ctx.database.get('assets', {}, {
      sort: { id: 'desc' },
      fields: ['branch'],
      limit: 1,
    })
    if (!file) return { branch: offset, size: 0 }
    const { branch } = file
    if (forceNew) return { branch: branch + offset, size: 0 }

    const size = await this.ctx.database
      .select('assets', { branch: file.branch })
      .execute(row => $.sum(row.size))
    if (size >= this.config.maxBranchSize) {
      this.logger.debug(`will switch to branch ${toBranchName(branch)}`)
      return { branch: branch + offset, size: 0 }
    } else {
      this.logger.debug(`will remain on branch ${toBranchName(branch)}`)
      return { branch, size }
    }
  }

  private async checkout(forceNew?: boolean, fetch?: boolean, offset = 1): Promise<Branch> {
    const res = await this.getBranch(forceNew, offset)
    const branchName = toBranchName(res.branch)
    if (!res.size) {
      this.logger.debug(`Checking out to a new branch ${branchName}`)
      await this.git.checkout(['--orphan', branchName])
      await this.git.raw(['rm', '-rf', '.'])
      this.logger.debug(`Checked out to a new branch ${branchName}`)
    } else {
      this.logger.debug(`Checking out existing branch ${branchName}`)
      if (fetch) {
        await this.git.fetch('origin', branchName)
      }
      await this.git.checkout(branchName, ['-f'])
      if (fetch) {
        await this.git.reset(ResetMode.HARD, [`origin/${branchName}`])
      }
      this.logger.debug(`Checked out existing branch ${branchName}`)
    }
    return res
  }

  private async createTask(file: FileInfo) {
    return new Promise<string>((resolve, reject) => {
      let task = this.taskMap.get(file.hash)
      if (!task) {
        task = new Task(this, file)
        this.taskQueue.push(task)
        this.taskMap.set(file.hash, task)
      }
      task.resolvers.push(resolve)
      task.rejectors.push(reject)
    })
  }

  private getTasks(available: number) {
    const tasks: Task[] = []
    let size = 0
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0]
      size += task.size
      if (size > available) break
      this.taskQueue.shift()
      tasks.push(task)
    }
    return tasks
  }

  private async mainLoop() {
    if (!this.taskQueue.length) {
      return sleep(this.config.flushInterval)
    }

    this.logger.debug(`Processing files.`)
    let branch = await this.checkout()
    let tasks = this.getTasks(this.config.maxBranchSize - branch.size)
    if (!tasks.length) {
      branch = await this.checkout(true)
      tasks = this.getTasks(this.config.maxBranchSize)
    }
    if (!tasks.length) return

    this.logger.debug(`Will process ${tasks.length} files.`)
    try {
      this.logger.debug(`Moving files.`)
      await Promise.all(tasks.map(async (task) => {
        task.branch = branch.branch
        await rename(task.tempPath, task.savePath)
      }))
      this.logger.debug(`Committing files.`)
      await this.git
        .add(tasks.map(task => task.filename))
        .commit('upload')
        .push('origin', toBranchName(branch.branch), ['-u', '-f'])
      this.logger.debug(`Saving file entries to database.`)
      await this.ctx.database.upsert('assets', tasks)
      this.logger.debug(`Finished processing files.`)
      for (const task of tasks) {
        task.resolve()
      }
    } catch (e) {
      this.logger.warn(`Errored processing files: ${e.toString()}`)
      await Promise.all(tasks.map(task => task.reject(e)))
    } finally {
      for (const file of tasks) {
        this.taskMap.delete(file.hash)
      }
    }
  }

  toPublicUrl(file: File) {
    const { user, repo } = this.config.github
    return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${file.branch}/${file.hash}-${file.name}`
  }

  async upload(url: string, _file?: string) {
    const { buffer, hash, name } = await this.analyze(url, _file)
    const [file] = await this.ctx.database.get('assets', { hash })
    if (file) return this.toPublicUrl(file)
    await writeFile(join(this.config.tempDir, hash), buffer)
    return this.createTask({ size: buffer.byteLength, hash, name })
  }

  async stats() {
    const selection = this.ctx.database.select('assets')
    const [assetCount, assetSize] = await Promise.all([
      selection.execute(row => $.count(row.id)),
      selection.execute(row => $.sum(row.size)),
    ])
    return { assetCount, assetSize }
  }
}

namespace GitAssets {
  export interface GitHubConfig {
    user: string
    repo: string
    token: string
  }

  const GitHubConfig: Schema<GitHubConfig> = Schema.object({
    user: Schema.string().required(),
    repo: Schema.string().required(),
    token: Schema.string().role('secret').required(),
  })

  export interface GitConfig extends Partial<SimpleGitOptions> {}

  export const GitConfig: Schema<GitConfig> = Schema.object({
    baseDir: Schema.string().required(),
  })

  export interface Config extends Assets.Config {
    git: GitConfig
    github: GitHubConfig
    tempDir: string
    flushInterval: number
    maxBranchSize: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      github: GitHubConfig,
      git: GitConfig,
      tempDir: Schema.string().default(resolve(__dirname, '../.temp')),
      flushInterval: Schema.natural().role('ms').default(Time.second * 3),
      maxBranchSize: Schema.natural().role('byte').default(50 * 1024 * 1024),
    }),
    Assets.Config,
  ] as const)
}

export default GitAssets
