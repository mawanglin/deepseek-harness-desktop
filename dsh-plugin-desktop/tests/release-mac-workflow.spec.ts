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

const workflowPath = new URL('../../.github/workflows/release-mac.yml', import.meta.url)
const workflow = parse(readFileSync(workflowPath, 'utf8')) as ReleaseWorkflow

describe('macOS release workflow', () => {
  it('triggers only on version tags with write-scoped contents permission', () => {
    expect(workflow.on?.push?.tags).toEqual(['v*'])
    expect(workflow.permissions).toEqual({ contents: 'write' })
  })

  it('runs the full gate and builds the unsigned universal DMG on a macOS runner', () => {
    const job = workflow.jobs?.['release-mac']
    expect(job?.['runs-on']).toBe('macos-latest')
    const steps = job?.steps ?? []
    expect(steps.some(step => step.run === 'yarn check')).toBe(true)
    const packageStep = steps.find(
      step => step.run === 'yarn workspace dsh-plugin-desktop dist:mac-smoke',
    )
    expect(packageStep).toBeDefined()
    expect(packageStep?.env?.DSH_PACKAGE_CHECK_ALREADY_RAN).toBe('1')
  })

  it('verifies the pushed tag matches the packaged version before publishing', () => {
    const job = workflow.jobs?.['release-mac']
    const verifyStep = job?.steps?.find(
      step => step.name === 'Verify the tag matches the packaged version',
    )
    expect(verifyStep).toBeDefined()
    expect(verifyStep?.run).toContain('tag" = "v$version"')
  })

  it('creates a draft release only when missing, then uploads the DMG from the smoke output', () => {
    const job = workflow.jobs?.['release-mac']
    const publishStep = job?.steps?.find(
      step => step.name === "Publish to the tag's GitHub Release",
    )
    expect(publishStep?.run).toContain('gh release create "$tag"')
    expect(publishStep?.run).toContain('--draft')
    expect(publishStep?.run).toContain('gh release upload "$tag"')
    expect(publishStep?.run).toContain('dsh-plugin-desktop/dist/mac-smoke/*.dmg')
  })
})
