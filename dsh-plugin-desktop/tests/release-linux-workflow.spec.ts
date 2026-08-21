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

const workflowPath = new URL('../../.github/workflows/release-linux.yml', import.meta.url)
const workflow = parse(readFileSync(workflowPath, 'utf8')) as ReleaseWorkflow

describe('Linux release workflow', () => {
  it('triggers only on version tags with write-scoped contents permission', () => {
    expect(workflow.on?.push?.tags).toEqual(['v*'])
    expect(workflow.permissions).toEqual({ contents: 'write' })
  })

  it('installs rpmbuild, runs the full gate, and packages all three Linux targets', () => {
    const job = workflow.jobs?.['release-linux']
    expect(job?.['runs-on']).toBe('ubuntu-latest')
    const steps = job?.steps ?? []
    expect(steps.some(step => step.run?.includes('apt-get install -y rpm'))).toBe(true)
    expect(steps.some(step => step.run === 'yarn check')).toBe(true)
    const packageStep = steps.find(
      step => step.run === 'yarn workspace dsh-plugin-desktop dist:linux',
    )
    expect(packageStep).toBeDefined()
    expect(packageStep?.env?.DSH_PACKAGE_CHECK_ALREADY_RAN).toBe('1')
  })

  it('creates a draft release only when missing, then uploads all three artifacts', () => {
    const job = workflow.jobs?.['release-linux']
    const publishStep = job?.steps?.find(
      step => step.name === "Publish to the tag's GitHub Release",
    )
    expect(publishStep?.run).toContain('gh release create "$tag"')
    expect(publishStep?.run).toContain('--draft')
    expect(publishStep?.run).toContain('gh release upload "$tag"')
    expect(publishStep?.run).toContain('DSH-Desktop-*.deb')
    expect(publishStep?.run).toContain('DSH-Desktop-*.rpm')
    expect(publishStep?.run).toContain('DSH-Desktop-*.AppImage')
  })
})
