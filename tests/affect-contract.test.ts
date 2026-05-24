import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AFFECTIVE_PERSONA_CONTRACT,
  loadAffectivePersonaContract
} from '../src/affect/persona-contract.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cyrene-affect-contract-'))
  tempDirs.push(dir)
  return dir
}

describe('loadAffectivePersonaContract', () => {
  it('uses the default contract when no project contract exists', async () => {
    const root = await createTempDir()

    const contract = await loadAffectivePersonaContract(root)

    expect(contract).toEqual(DEFAULT_AFFECTIVE_PERSONA_CONTRACT)
    expect(contract.name).toBe('Cyrene')
    expect(contract.identity.selfDisclosure).toBe('non_sentient_transparent')
    expect(contract.boundaries.noClaimedSentience).toBe(true)
    expect(contract.boundaries.noEmotionalManipulation).toBe(true)
  })

  it('loads an explicit contract from .cyrene/persona/contract.json', async () => {
    const root = await createTempDir()
    await mkdir(join(root, '.cyrene', 'persona'), { recursive: true })
    await writeFile(
      join(root, '.cyrene', 'persona', 'contract.json'),
      JSON.stringify({
        ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT,
        version: '2.0.0',
        baselineTone: {
          ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.baselineTone,
          warmth: 0.5
        }
      })
    )

    const contract = await loadAffectivePersonaContract(root)

    expect(contract.version).toBe('2.0.0')
    expect(contract.baselineTone.warmth).toBe(0.5)
    expect(contract.boundaries.noClaimedSentience).toBe(true)
  })
})
