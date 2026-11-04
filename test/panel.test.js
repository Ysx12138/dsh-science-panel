import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { localScienceUrl,validCliPath } from '../lib/config.js';
import { apply, findArtifact, saveDownload } from '../lib/index.js';
import { Readable } from 'node:stream';

test('login accepts only the configured local service', () => {
  assert.equal(localScienceUrl('http://127.0.0.1:8990/example', 8990), 'http://127.0.0.1:8990/example');
  assert.throws(() => localScienceUrl('https://example.com:8990/example', 8990));
  assert.throws(() => localScienceUrl('http://127.0.0.1:8000/example', 8990));
  assert.throws(() => localScienceUrl('http://user@localhost:8990/example', 8990));
});

test('validates Windows and macOS executable paths without accepting relative paths',()=>{
  assert.equal(validCliPath('C:\\Program Files\\Science\\claude-science.exe','win32'),true);
  assert.equal(validCliPath('C:relative\\science.exe','win32'),false);
  assert.equal(validCliPath('relative\\science.exe','win32'),false);
  assert.equal(validCliPath('claude-science.exe','win32'),true);
  assert.equal(validCliPath('/Applications/Science/bin/claude-science','darwin'),true);
  assert.equal(validCliPath('relative/science','darwin'),false);
});

test('host endpoints reject unauthenticated requests', async () => {
  const routes={};
  apply({effect(fn){fn()},webServer:{register({path,handler}){routes[path]=handler}},connection:{requestRejection(){return 403}}});
  for (const handler of Object.values(routes)) {
    const req=Readable.from([]);req.method='POST';
    const response={statusCode:200, end(){}, setHeader(){}};
    await handler(req,response);
    assert.equal(response.statusCode,403);
  }
});

test('download uses the stored artifact, preserves names, and never overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-science-test-'));
  try {
    const org = join(dir, 'orgs', 'test-org'), artifacts = join(org, 'artifacts'), downloads = join(dir, 'downloads');
    await mkdir(artifacts, {recursive:true}); await mkdir(downloads);
    const version='12345678-1234-1234-1234-123456789abc', artifact='87654321-4321-4321-4321-cba987654321';
    await writeFile(join(artifacts,'data.md'),'original');
    execFileSync('sqlite3',[join(org,'operon-cli.db'),`CREATE TABLE artifacts(id TEXT, filename TEXT, latest_version_id TEXT); CREATE TABLE artifact_versions(id TEXT, artifact_id TEXT, storage_path TEXT); INSERT INTO artifacts VALUES('${artifact}','example.md','${version}'); INSERT INTO artifact_versions VALUES('${version}','${artifact}','data.md');`]);
    const record = await findArtifact(dir, undefined, version);
    assert.equal(record.name,'example.md');
    assert.equal(await saveDownload(record.source,record.name,downloads),'example.md');
    assert.equal(await saveDownload(record.source,record.name,downloads),'example (1).md');
    assert.equal(await readFile(join(downloads,'example.md'),'utf8'),'original');
    assert.equal(await readFile(join(downloads,'example (1).md'),'utf8'),'original');
    await assert.rejects(findArtifact(dir,"' OR 1=1 --",undefined),/无效/);
    await writeFile(join(dir,'outside.md'),'outside');
    await symlink(join(dir,'outside.md'),join(artifacts,'escape.md'));
    execFileSync('sqlite3',[join(org,'operon-cli.db'),`UPDATE artifact_versions SET storage_path='escape.md';`]);
    await assert.rejects(findArtifact(dir,undefined,version),/文件位置不受支持/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
