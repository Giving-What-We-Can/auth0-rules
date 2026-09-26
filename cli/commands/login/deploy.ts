import { fs } from 'mz'
import path from 'path'
import auth0 from '../../lib/client'

export default async function run() {
  try {
    await deployLoginTemplate()
    await deployCustomText()
  } catch (err) {
    console.log('err', err)
    process.exit(1)
  }
}

async function deployLoginTemplate() {
  const branding = auth0.branding
  const newTemplate = (
    await fs.readFile(path.join(__dirname, '../../../templates/login.liquid'))
  ).toString()
  await branding.setUniversalLoginTemplate({
    template: newTemplate,
  })
}

async function deployCustomText() {
  const customText = JSON.parse(
    (
      await fs.readFile(
        path.join(__dirname, '../../../templates/custom-text.json')
      )
    ).toString()
  )

  await auth0.prompts.updateCustomTextByLanguage(
    {
      prompt: 'signup',
      language: 'en',
    },
    customText
  )
}
