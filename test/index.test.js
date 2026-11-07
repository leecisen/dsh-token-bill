import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import * as plugin from '../index.js'
import { PROJECTION_KEY, STATE_VERSION } from '../lib/fold.js'

describe('index.js', () => {
  it('declares its name and the sessionProjections dependency', () => {
    assert.equal(plugin.name, 'dsh-token-bill')
    assert.deepEqual(plugin.inject, ['sessionProjections'])
  })

  it('awaits registration of the projection priced by the row config', async () => {
    const registered = []
    let settled = false
    const ctx = {
      sessionProjections: {
        register: (definition) => {
          registered.push(definition)
          return new Promise(resolve => setTimeout(() => { settled = true; resolve({ dispose: async () => {} }) }, 5))
        },
      },
    }
    await plugin.apply(ctx, { currency: 'USD' })
    assert.equal(settled, true, 'apply resolves only after the registry delivered the handle')
    assert.equal(registered.length, 1)
    const [definition] = registered
    assert.equal(definition.key, PROJECTION_KEY)
    assert.equal(definition.stateVersion, STATE_VERSION)
    assert.notEqual(definition.wire.summary, false, 'the view rides the session-list summaries')
    const state = definition.init({}, 0)
    assert.equal(definition.stateSchema.parse(state), state)
    assert.equal(definition.wire.view(state).currency, 'USD')
  })

  it('keeps package metadata, the bundle patch, and the client id in step', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    assert.equal(pkg.name, plugin.name)
    assert.match(patch, new RegExp(`name: ${pkg.name}\\b`))
    assert.match(patch, /id: dsh-token-bill\b/)
    assert.match(client, new RegExp(`id: '${pkg.name}'`))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'README.en.md', 'icon.svg', 'LICENSE']) {
      assert.ok(pkg.files.includes(file), `package.json files should list ${file}`)
    }
    for (const lang of ['zh', 'en']) {
      const meta = JSON.parse(readFileSync(new URL(`../locale/${lang}.json`, import.meta.url), 'utf8')).meta
      assert.ok(meta.title && meta.description, `${lang} meta has a title and description`)
      assert.ok(pkg.files.includes(meta.detail), `${lang} detail document ${meta.detail} is packaged`)
    }
  })
})
