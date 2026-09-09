import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
describe('ci-debug', () => {
  it('dumps import.meta.url resolution', () => {
    const packageRoot = new URL('../', import.meta.url)
    const workspaceRoot = new URL('../', packageRoot)
    const ciPath = new URL('.github/workflows/ci.yml', workspaceRoot)
    const content = existsSync(ciPath) ? readFileSync(ciPath, 'utf8') : '<MISSING>'
    const im = content.indexOf('  desktop-macos:')
    const il = content.indexOf('  desktop-linux:')
    const macos = content.slice(im, il)
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    console.log('DBG import.meta.url=' + import.meta.url)
    console.log('DBG workspaceRoot=' + workspaceRoot.pathname)
    console.log('DBG ciPath=' + ciPath.pathname + ' exists=' + existsSync(ciPath))
    console.log('DBG gitRoot=' + gitRoot)
    console.log('DBG workspaceRoot==gitRoot? ' + (workspaceRoot.pathname === gitRoot + '/'))
    console.log('DBG ciLen=' + content.length)
    console.log('DBG idxMac=' + im + ' idxLin=' + il)
    console.log('DBG macosHasYarnCheck=' + macos.includes('- run: yarn check'))
    console.log('DBG gitBlobHashOfCiAtRoot=' + execFileSync('git', ['hash-object', gitRoot + '/.github/workflows/ci.yml'], { encoding: 'utf8' }).trim())
    expect('__fail_to_dump__').toBe(false)
  })
})
