/** Generate the freedesktop hicolor Linux icon set from the cross-platform source. */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Standard freedesktop hicolor icon sizes generated from the source artwork. */
export const LINUX_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourcePath = join(packageRoot, 'build', 'app-icon.png')
const outputDir = join(packageRoot, 'build', 'icons')

/**
 * Derive the Linux icon set without changing the cross-platform source.
 *
 * electron-builder installs each PNG at `/usr/share/icons/hicolor/<size>x<size>/apps/`
 * only for standard hicolor sizes; a single oversized source icon would land in a
 * non-standard directory that desktop environments ignore. This script produces the
 * standard 16-512px set so launchers resolve `Icon=` in the packaged `.desktop` entry.
 * @param {string} source - absolute path to the square source PNG.
 * @param {string} outDir - absolute path for the generated icon set directory.
 * @returns {Promise<void>} Resolves after every size has been written and verified.
 */
export async function generateLinuxIcons(source = sourcePath, outDir = outputDir) {
  const metadata = await sharp(source).metadata()
  if (
    metadata.format !== 'png'
    || metadata.width !== metadata.height
    || metadata.width < LINUX_ICON_SIZES[LINUX_ICON_SIZES.length - 1]
    || metadata.hasAlpha !== true
  ) {
    throw new Error(
      `generate-linux-icons: source must be a square RGBA PNG of at least 512x512 pixels`,
    )
  }

  await mkdir(outDir, { recursive: true })
  for (const size of LINUX_ICON_SIZES) {
    const rendered = await sharp(source, { failOn: 'warning' })
      .resize({
        width: size,
        height: size,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .png({
        compressionLevel: 9,
        progressive: false,
        adaptiveFiltering: false,
        palette: false,
      })
      .toBuffer()

    const generated = await sharp(rendered).metadata()
    if (
      generated.format !== 'png'
      || generated.width !== size
      || generated.height !== size
      || generated.depth !== 'uchar'
      || generated.bitsPerSample !== 8
      || generated.channels !== 4
      || generated.hasAlpha !== true
    ) {
      throw new Error(`generate-linux-icons: generated ${size}x${size} icon is not an 8-bit RGBA PNG`)
    }

    await writeFile(join(outDir, `${size}x${size}.png`), rendered)
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await generateLinuxIcons()
}
