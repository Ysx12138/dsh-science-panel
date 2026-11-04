import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const HOME = homedir();
const configPath = join(HOME, '.config', 'dsh-science-panel', 'config.json');

async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`无法读取配置文件 ${path}`); }
}

export async function loadConfig() {
  const config = await optionalJson(configPath);
  const managed = await optionalJson(join(HOME, '.csswitch', 'science-managed-launch.v1.json'));
  const cli = config.cliPath || managed.runtime_path || 'claude-science';
  const dataDir = config.dataDir || managed.data_dir || join(HOME, '.claude-science');
  const port = config.port ?? managed.port ?? 8000;
  if (typeof cli !== 'string' || !cli || (cli.includes('/') && !isAbsolute(cli))) throw new Error('Science CLI 路径必须是绝对路径或可执行程序名');
  if (typeof dataDir !== 'string' || !isAbsolute(dataDir)) throw new Error('Science 数据目录必须是绝对路径');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Science 端口无效');
  return {cli, dataDir, port};
}

export function localScienceUrl(value, port) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || Number(url.port) !== port || url.username || url.password) throw new Error('Science 登录地址不符合本机限制');
  return url.href;
}
