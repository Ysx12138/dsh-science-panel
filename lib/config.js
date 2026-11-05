import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, win32, posix } from 'node:path';

const userHome = homedir();
const configPath = join(userHome, '.config', 'dsh-science-panel', 'config.json');

export function validCliPath(value,platform=process.platform) {
  if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))return false;
  const path=platform==='win32'?win32:posix;
  if(value.includes('/')||value.includes('\\')||(platform==='win32'&&/^[A-Za-z]:/.test(value)))return path.isAbsolute(value);
  return true;
}

async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`无法读取配置文件 ${path}`); }
}

export async function loadConfig() {
  const config = await optionalJson(configPath);
  const managed = await optionalJson(join(userHome, '.csswitch', 'science-managed-launch.v1.json'));
  const cli = config.cliPath || managed.runtime_path || 'claude-science';
  const dataDir = config.dataDir || managed.data_dir || join(userHome, '.claude-science');
  const port = config.port ?? managed.port ?? 8000;
  if (!validCliPath(cli)) throw new Error('Science CLI 路径必须是绝对路径或可执行程序名');
  if (typeof dataDir !== 'string' || !isAbsolute(dataDir)) throw new Error('Science 数据目录必须是绝对路径');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Science 端口无效');
  return {cli, dataDir, port};
}

export function localScienceUrl(value, port) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || Number(url.port) !== port || url.username || url.password) throw new Error('Science 登录地址不符合本机限制');
  return url.href;
}
