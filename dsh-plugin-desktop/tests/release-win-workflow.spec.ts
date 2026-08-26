import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface WorkflowStep {
  readonly name?: string
  readonly run?: string
  readonly env?: Record<string, unknown>
}

interface WorkflowJob {
  readonly 'runs-on'?: string
  readonly steps?: readonly WorkflowStep[]
}

interface ReleaseWorkflow {
  readonly on?: { push?: { tags?: readonly string[] } }
  readonly permissions?: { contents?: string }
  readonly jobs?: Record<string, WorkflowJob>
}

const workflowPath = new URL('../../.github/workflows/release-win.yml', import.meta.url)
const workflow = parse(readFileSync(workflowPath, 'utf8')) as ReleaseWorkflow

describe('Windows release workflow', () => {
  it('triggers only on version tags with write-scoped contents permission', () => {
    expect(workflow.on?.push?.tags).toEqual(['v*'])
    expect(workflow.permissions).toEqual({ contents: 'write' })
  })

  it('runs the full gate and builds installer and portable archives on a Windows runner', () => {
    const job = workflow.jobs?.['release-win']
    expect(job?.['runs-on']).toBe('windows-latest')
    const steps = job?.steps ?? []
    expect(steps.some(step => step.run === 'yarn check')).toBe(true)
    const installerStep = steps.find(
      step => step.run === 'yarn workspace dsh-plugin-desktop dist:win',
    )
    expect(installerStep).toBeDefined()
    expect(installerStep?.env?.DSH_PACKAGE_CHECK_ALREADY_RAN).toBe('1')
    const portableStep = steps.find(
      step => step.run === 'yarn workspace dsh-plugin-desktop dist:win-portable',
    )
    expect(portableStep).toBeDefined()
    expect(portableStep?.env?.DSH_PACKAGE_CHECK_ALREADY_RAN).toBe('1')
  })

  it('verifies the pushed tag matches the packaged version in a bash shell', () => {
    const job = workflow.jobs?.['release-win']
    const verifyStep = job?.steps?.find(
      step => step.name === 'Verify the tag matches the packaged version',
    )
    expect(verifyStep).toBeDefined()
    expect(verifyStep?.shell).toBe('bash')
    expect(verifyStep?.run).toContain('tag" = "v$version"')
  })

  it('creates a draft release only when missing, then uploads both Windows artifacts', () => {
    const job = workflow.jobs?.['release-win']
    const publishStep = job?.steps?.find(
      step => step.name === "Publish to the tag's GitHub Release",
    )
    expect(publishStep?.shell).toBe('bash')
    expect(publishStep?.run).toContain('gh release create "$tag"')
    expect(publishStep?.run).toContain('--draft')
    expect(publishStep?.run).toContain('gh release upload "$tag"')
    expect(publishStep?.run).toContain('DSH-Desktop-*-Setup.exe')
    expect(publishStep?.run).toContain('DSH-Desktop-*-Portable.zip')
  })
})
