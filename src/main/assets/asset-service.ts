import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import { ok, uid, now, type Asset, type Result } from '../../shared/model';
import { session, errorResult } from '../projects/project-service';
import { readSnapshot, writeSnapshot } from '../projects/database';
import { inside } from '../projects/manifest';
import { hashFile } from '../projects/backup';
const mime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.srt': 'text/plain',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
};
export async function importAsset(h: string, selectedPath: string): Promise<Result<Asset>> {
  let temp = '';
  try {
    const s = session(h),
      ext = path.extname(selectedPath).toLowerCase();
    if (!mime[ext]) throw Error('不支援此檔案格式');
    const stat = fs.lstatSync(selectedPath);
    if (!stat.isFile() || stat.size > 20 * 1024 ** 3) throw Error('檔案類型或大小不支援');
    const id = uid(),
      relativePath = `media/${id}${ext}`,
      destination = inside(s.root, relativePath);
    temp = destination + '.tmp';
    await pipeline(fs.createReadStream(selectedPath), fs.createWriteStream(temp, { flags: 'wx' }));
    const type = mime[ext];
    const kind: Asset['kind'] = type.startsWith('image')
      ? 'image'
      : type.startsWith('video')
        ? 'video'
        : type.startsWith('audio')
          ? 'audio'
          : 'document';
    let durationMs: number | null = null;
    if (kind !== 'document') {
      const binary = ffprobe.path.replace('app.asar', 'app.asar.unpacked');
      const { stdout } = await promisify(execFile)(
        binary,
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temp],
        { timeout: 30000, maxBuffer: 2 * 1024 ** 2 },
      );
      const probe = JSON.parse(stdout);
      if (!probe.streams?.length) throw Error('媒體無法解碼');
      const expectedStream = kind === 'audio' ? 'audio' : 'video';
      if (
        !probe.streams.some(
          (stream: { codec_type: string }) => stream.codec_type === expectedStream,
        )
      )
        throw Error('媒體串流與副檔名類型不符');
      const formats: Record<string, string[]> = {
        '.png': ['png_pipe', 'image2'],
        '.jpg': ['jpeg_pipe', 'image2'],
        '.jpeg': ['jpeg_pipe', 'image2'],
        '.webp': ['webp_pipe', 'image2'],
        '.gif': ['gif'],
        '.mp4': ['mov', 'mp4'],
        '.mov': ['mov'],
        '.webm': ['matroska', 'webm'],
        '.wav': ['wav'],
        '.mp3': ['mp3'],
        '.m4a': ['mov', 'm4a'],
        '.ogg': ['ogg'],
      };
      const detected = String(probe.format?.format_name || '').split(',');
      if (!formats[ext]?.some((format) => detected.includes(format)))
        throw Error('媒體容器與副檔名不符');
      if (probe.format?.duration) {
        durationMs = Math.round(Number(probe.format.duration) * 1000);
        if (!Number.isFinite(durationMs)) durationMs = null;
      }
    }
    const a: Asset = {
      id,
      revisionId: uid(),
      relativePath,
      name: path.basename(selectedPath),
      sha256: await hashFile(temp),
      bytes: stat.size,
      mime: type,
      kind,
      createdAt: now(),
      durationMs,
      status: 'unreviewed',
      reason: '',
      rights: 'unreviewed',
      licenseNote: '',
    };
    fs.renameSync(temp, destination);
    temp = '';
    const snapshot = readSnapshot(s.db);
    snapshot.assets.push(a);
    try {
      writeSnapshot(s.db, snapshot);
    } catch (e) {
      fs.rmSync(destination, { force: true });
      throw e;
    }
    return ok(a);
  } catch (e) {
    return errorResult(e);
  } finally {
    if (temp && fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}
export function resolveAsset(h: string, assetId: string) {
  const s = session(h);
  const a = readSnapshot(s.db).assets.find((a) => a.id === assetId);
  if (!a) throw Error('資產不存在');
  return inside(s.root, a.relativePath);
}
