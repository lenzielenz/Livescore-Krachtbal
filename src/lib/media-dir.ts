import path from 'path'

// Opslagmap voor geüploade bestanden (zelfde logica als de Media-collectie). Op Railway is de
// containerschijf vluchtig; staat er een Volume gekoppeld (RAILWAY_VOLUME_MOUNT_PATH) of een
// expliciet MEDIA_DIR, dan blijven bestanden bewaard. Voor tijdelijke clips volstaat de schijf.
export function resolveMediaDir(): string {
  if (process.env.MEDIA_DIR) return path.resolve(process.env.MEDIA_DIR)
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'media')
  return path.resolve(process.cwd(), 'media')
}
